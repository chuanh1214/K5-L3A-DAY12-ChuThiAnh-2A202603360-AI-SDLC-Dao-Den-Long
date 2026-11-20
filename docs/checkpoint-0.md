# Checkpoint 0 — Chuẩn bị

## Môi trường

- AI: Codex để đọc đề, chuẩn bị môi trường và kiểm chứng. Claude lab board dùng để đọc yêu cầu và trao đổi với trợ giảng.
- Kỹ thuật: JavaScript, Three.js cho giao diện 3D trên trình duyệt và Node.js 22 cho mô phỏng headless.
- Kiểm tra chuẩn bị: chạy `node scripts/hello-headless.mjs`. Chương trình kiểm tra vòng lặp 60 tick/giây trong 120 tick, không cần GPU hoặc thư viện ngoài.

## Giả định và quyết định

- Checkpoint 0 là bước chuẩn bị trong Phase 1 theo `CHECKPOINTS.md`.
- Logic mô phỏng sẽ tách khỏi giao diện để dùng chung trong game và CLI. Thông số gameplay sẽ được ghi và kiểm chứng khi làm PRD-0.

## Nhật ký AI

- Codex đọc tài liệu lab, đối chiếu PRD-0, đề xuất công nghệ và tạo chương trình kiểm tra môi trường. Token/chi phí của lượt này chưa có số liệu.

## Bằng chứng

- Kết quả chạy trên Node.js v22.13.0: `{"check":"hello-headless","ticks":120,"seconds":2,"distance_m":6}`.
- Repo công khai: chủ repo xác nhận xem được trên GitHub trong cửa sổ ẩn danh.
- Trợ giảng: đã có PRD-0 và Test Contract do chủ repo cung cấp. Chưa xác nhận việc hỏi thử trợ giảng.
- Hạn nộp: các mốc trong đề là 1h, 2h, 2h30 và 4h. Chưa có giờ bắt đầu từ thông báo của Coach trong ghi chép.
- Clone sạch: chạy lại chương trình thử từ bản clone sau khi chủ repo tạo commit Phase 1.
