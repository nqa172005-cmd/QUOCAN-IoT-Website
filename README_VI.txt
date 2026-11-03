QUOCAN IoT - BẢN NÂNG CẤP LỊCH SỬ DỮ LIỆU

1. Giải nén ZIP.
2. Sao chép .env.example thành .env rồi điền TB_USERNAME, TB_PASSWORD, TB_DEVICE_NAME hoặc TB_DEVICE_ID.
   Nếu đã có .env cũ đang hoạt động, hãy sao chép riêng file đó vào thư mục mới trên máy của bạn.
   KHÔNG chia sẻ file .env hoặc đưa lên GitHub.
3. Cài Node.js 20+ (khuyến nghị 22+).
4. Chạy start.bat hoặc lệnh node server.js.
5. Mở http://localhost:3000
6. Kéo xuống mục Biểu đồ lịch sử cảm biến; chọn 24 giờ / 7 ngày / 30 ngày, thông số và Xuất CSV.

API mới: GET /api/history?period=24h (hoặc 7d, 30d).
Dữ liệu lịch sử nằm ở ThingsBoard Cloud, không phải lưu trong website.
Biểu đồ dùng AVG theo mốc 15 phút/2 giờ/8 giờ để tránh quá nhiều điểm.
Giá trị distance âm (không đo được) bị loại khỏi biểu đồ.
Cảnh báo dùng các mẫu fall_alert đã lưu; nếu không được ghi hoặc bị giới hạn truy vấn, sẽ không hiện.
Giới hạn 10000 mẫu cảnh báo cho mỗi lượt truy vấn; khi có nhiều mẫu hơn, lịch sử cảnh báo có thể không đầy đủ.
Số bước chân là bộ đếm tích lũy, biểu đồ không biểu thị số bước đi trong từng khoảng.

BẢO MẬT: server.js chỉ nghe trên 127.0.0.1; CHƯA PHÙ HỢP công khai Internet.
Trước khi triển khai Internet phải thêm xác thực người xem, HTTPS và quản lý bí mật bằng biến môi trường.
