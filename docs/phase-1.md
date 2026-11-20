# Phase 1 — PRD-0, Contract v1.0

## Quyết định và giả định

- Đêm 1 dùng đảo tròn 40 m và 5 đèn. Bán kính, vị trí đèn và lịch sinh được chọn cho Phase 1. Mọi thông số contract được tải từ `game.contract.json` ở cả CLI và giao diện.
- Đom đóm tự được nhặt khi trong bán kính XZ và còn chỗ. E nạp số lượng nhỏ hơn giữa số đang mang và số đèn còn thiếu; chọn đèn chưa sáng gần nhất trong tầm. Nạp dở được giữ lại.
- Mây bắt đầu với 3 Ngọn Lửa. Chạm Bóng Mực làm mất một Ngọn Lửa và kích hoạt bất tử 1,5 giây. Va chạm không làm rơi đom đóm. Đèn sáng có vùng an toàn và mép đảo giới hạn di chuyển, không phạt rơi.
- Tỏa Sáng được kích hoạt khi nhấn, tốn 2 đom đóm, có hồi chiêu 1 giây. Mỗi Bóng Mực trong bán kính 6 m bị đẩy ra 3 m và choáng 2 giây.
- Dùng công thức điểm và thứ tự xử lý trong README. Xét hết Ngọn Lửa trước, sau đó xét tất cả đèn sáng, cuối cùng xét bình minh.
- Danh sách thực thể trong scenario thay thế thực thể có sẵn. Nếu truyền danh sách mà không đặt cờ ngẫu nhiên tương ứng, lượt chạy dùng riêng danh sách đó. Đặt cờ true để bật lịch sinh.

## Tiêu chí nghiệm thu và kiểm chứng

| Yêu cầu | Cách kiểm chứng |
|---|---|
| Camera góc nhìn thứ ba, Mây có nón lá và đèn, đi lại và nhảy | Mở game, bắt đầu Đêm 1. Kiểm tra hình ảnh, WASD, xoay camera và Space. Test CLI kiểm tra xoay vector, chuẩn hóa, giữ input và nhảy. |
| Đom đóm, nạp từng phần và thắp đủ 5 đèn | Test CLI dựng 4 đèn đã sáng, kiểm tra các sự kiện nhặt, nạp, thắp và thắng ở đèn cuối. |
| Bóng Mực truy đuổi, gây hit, sợ đèn, bị Tỏa Sáng | Test CLI kiểm tra sinh, di chuyển, choáng, đẩy lùi, vùng an toàn, bất tử và hết Ngọn Lửa. |
| HUD, kết quả, điểm và chơi lại | Test CLI kiểm tra điểm, mất Ngọn Lửa và bình minh. Trong trình duyệt, kiểm tra HUD trong trận và nút Chơi lại sau khi kết thúc. |
| Contract v1.0 | `npm test` chạy CLI qua tiến trình riêng. Kiểm tra snapshot tick 0, sự kiện, end, tính tất định theo byte và mã lỗi 2. |

## Nhật ký AI và đánh giá

- Codex triển khai bộ mô phỏng dùng chung, CLI và giao diện WebGL. Dùng đúng một nguồn tuning để hạn chế việc giá trị hiển thị và headless lệch nhau.
- Khi npm đi qua shim trên Windows, môi trường hạn chế chặn truy cập thư mục hồ sơ. Chạy trực tiếp npm CLI với cache thư mục tạm để chẩn đoán. Lệnh người chấm sử dụng vẫn là `npm ci`.
- Ước tính thô cho phần triển khai là khoảng 10.000–20.000 token, dựa trên độ dài đề, các lần đọc mã và khối mã được sinh. Đây là khoảng ước tính và chưa có dữ liệu chi phí.
- Phase 1 chưa có phase trước để chạy hồi quy. Khi cập nhật v1.1, giữ các kiểm tra còn hiệu lực và ghi lý do cho các thay đổi theo ticket.
