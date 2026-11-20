# Đảo Đèn Lồng

- Cài: `npm ci`. Chơi: `npm start`. Kiểm chứng: `npm test` và `node scripts/hello-headless.mjs`.
- Trước khi sửa gameplay, đối chiếu tiêu chí nghiệm thu và Test Contract của phase hiện tại. Phase 1 dùng v1.0.
- Giữ `src/game.mjs` chạy độc lập với DOM, WebGL và đồng hồ thực. Lớp hiển thị và CLI dùng cùng tuning từ `game.contract.json`.
- Chạy `node scripts/verify-phase1.mjs` trước khi báo hoàn tất Phase 1. Ghi lệnh, kết quả thực tế và các mục chưa kiểm tra vào tài liệu bằng chứng. Không ghi kết quả đạt cho một kiểm tra thất bại.
- Giữ lại các test còn hiệu lực khi chuyển phase. Ghi lý do khi ticket thay thế luật cũ. Không commit khóa, token, `.env` hoặc `node_modules`.
