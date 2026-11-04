
/*
  QUOCAN IoT
  Máy chủ trung gian kết nối ThingsBoard Cloud

  ESP32 -> ThingsBoard Cloud -> Node.js -> Website
*/

// ===== 1. ĐỌC FILE CẤU HÌNH =====

try {
  if (require("node:fs").existsSync(require("node:path").join(__dirname, ".env"))) {
    process.loadEnvFile(require("node:path").join(__dirname, ".env"));
    console.log("Đã đọc cấu hình .env");
  }
} catch (error) {
  console.error("Không đọc được file .env:", error.message);
  process.exit(1);
}

// ===== 2. THƯ VIỆN =====

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

// ===== 3. CẤU HÌNH =====

const root = __dirname;
const port = Number(process.env.PORT || 3000);

const base = "https://thingsboard.cloud";

const keys = [
  "temperature",
  "humidity",
  "speed_kmh",
  "accel_x", "accel_y", "accel_z",
  "fall_direction", "fall_candidate", "fall_event_id",
  "step_count",
  "fall_alert",
  "activity_status"
].join(",");

// ===== 4. BIẾN KẾT NỐI =====

let jwt = "";
let expiry = 0;

// ===== 5. ĐĂNG NHẬP THINGSBOARD =====

async function auth() {

  if (jwt && Date.now() < expiry) {
    return jwt;
  }

  const username = process.env.TB_USERNAME;
  const password = process.env.TB_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Thiếu TB_USERNAME hoặc TB_PASSWORD trong file .env"
    );
  }

  const response = await fetch(
    base + "/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      "Không đăng nhập được ThingsBoard. HTTP " +
      response.status
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("ThingsBoard không trả về token đăng nhập");
  }

  jwt = data.token;

  // Làm mới token định kỳ
  expiry = Date.now() + 5 * 60 * 1000;

  return jwt;
}

// ===== 6. GỬI YÊU CẦU API =====

async function tb(url) {

  for (let attempt = 0; attempt < 2; attempt++) {

    const token = await auth();

    const response = await fetch(
      base + url,
      {
        headers: {
          "X-Authorization": "Bearer " + token
        }
      }
    );

    if (response.status === 401 && attempt === 0) {
      jwt = "";
      expiry = 0;
      continue;
    }

    if (!response.ok) {
      throw new Error(
        "ThingsBoard trả về HTTP " + response.status
      );
    }

    return await response.json();
  }

  throw new Error("Không thể xác thực ThingsBoard");
}

// ===== 7. LẤY ID THIẾT BỊ =====

async function getDeviceId() {

  // Ưu tiên ID nếu người dùng cấu hình
  if (process.env.TB_DEVICE_ID) {
    return process.env.TB_DEVICE_ID.trim();
  }

  const deviceName =
    process.env.TB_DEVICE_NAME || "QuocanIot";

  const device = await tb(
    "/api/tenant/devices?deviceName=" +
    encodeURIComponent(deviceName)
  );

  if (!device || !device.id || !device.id.id) {
    throw new Error(
      "Không tìm thấy thiết bị: " + deviceName
    );
  }

  return device.id.id;
}

// ===== 8. LẤY DỮ LIỆU CẢM BIẾN =====

async function getTelemetry() {

  const deviceId = await getDeviceId();

  const url =
    "/api/plugins/telemetry/DEVICE/" +
    encodeURIComponent(deviceId) +
    "/values/timeseries?keys=" +
    encodeURIComponent(keys);

  return await tb(url);
}


// ===== LỊCH SỬ DỮ LIỆU THINGSBOARD =====
const historyKeys = "temperature,humidity,speed_kmh,step_count,accel_x,accel_y,accel_z,fall_alert";
const periods = { "24h": 24*3600000, "7d": 7*86400000, "30d": 30*86400000 };
async function getHistory(period) {
  if (!Object.prototype.hasOwnProperty.call(periods, period)) {
    throw new Error("Khoảng thời gian không hợp lệ");
  }
  const endTs = Date.now();
  const startTs = endTs - periods[period];
  // AVG phù hợp biểu đồ các đại lượng liên tục; riêng cảnh báo lấy mẫu thô bên dưới.
  const interval = period === "24h" ? 15*60000 : period === "7d" ? 2*3600000 : 8*3600000;
  const id = await getDeviceId();
  const prefix = "/api/plugins/telemetry/DEVICE/" + encodeURIComponent(id) + "/values/timeseries";
  const params = new URLSearchParams({ keys: historyKeys, startTs: String(startTs), endTs: String(endTs), interval: String(interval), agg: "AVG", limit: "1000" });
  const history = await tb(prefix + "?" + params.toString());
  // Cảnh báo 0/1 không được suy luận từ trung bình: lấy các mẫu thực tế riêng.
  const eventParams = new URLSearchParams({ keys: "fall_alert", startTs: String(startTs), endTs: String(endTs), agg: "NONE", limit: "10000" });
  const eventData = await tb(prefix + "?" + eventParams.toString());
  return { period, startTs, endTs, interval, series: history, fallSamples: eventData.fall_alert || [], fallSamplesLimit: 10000 };
}

// ===== 9. TRẢ DỮ LIỆU JSON =====

function sendJson(res, status, data) {

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  res.end(JSON.stringify(data));
}

// ===== 10. TẠO MÁY CHỦ WEBSITE =====

const server = http.createServer(
  async (req, res) => {

    try {

      const url = new URL(
        req.url,
        "http://localhost"
      );

      // API dữ liệu cảm biến
      if (url.pathname === "/api/telemetry") {

        if (req.method !== "GET") {
          return sendJson(res, 405, {
            error: "Phương thức không được hỗ trợ"
          });
        }

        const telemetry = await getTelemetry();

        return sendJson(res, 200, telemetry);
      }

      if (url.pathname === "/api/history") {
        if (req.method !== "GET") return sendJson(res, 405, { error: "Phương thức không được hỗ trợ" });
        const period = url.searchParams.get("period") || "24h";
        if (!Object.prototype.hasOwnProperty.call(periods, period)) return sendJson(res, 400, { error: "Chọn 24h, 7d hoặc 30d" });
        return sendJson(res, 200, await getHistory(period));
      }

      // Các file website được phép truy cập
      const routes = {
        "/": "index.html",
        "/index.html": "index.html",
        "/css/style.css": "css/style.css",
        "/js/app.js": "js/app.js"
      };

      const file = routes[url.pathname];

      if (!file) {
        res.writeHead(404);
        return res.end("Không tìm thấy trang");
      }

      const filePath = path.join(root, file);

      const content = await fs.readFile(filePath);

      let mime = "text/plain; charset=utf-8";

      if (file.endsWith(".html")) {
        mime = "text/html; charset=utf-8";
      } else if (file.endsWith(".css")) {
        mime = "text/css; charset=utf-8";
      } else if (file.endsWith(".js")) {
        mime = "text/javascript; charset=utf-8";
      }

      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });

      res.end(content);

    } catch (error) {

      console.error("Lỗi QUOCAN IoT:", error.message);

      sendJson(res, 500, {
        error: "Không thể lấy dữ liệu. Kiểm tra cấu hình ThingsBoard trên máy chủ."
      });
    }
  }
);

// ===== 11. KHỞI ĐỘNG =====

// Chỉ cho phép kết nối từ máy tính này
server.listen(port, "0.0.0.0", () => {

  console.log("==============================");
  console.log("       QUOCAN IoT");
  console.log("==============================");

  console.log(
    "Website: http://localhost:" + port
  );

  console.log(
    "API: http://localhost:" +
    port +
    "/api/telemetry"
  );

  console.log("Máy chủ đã khởi động!");
});
