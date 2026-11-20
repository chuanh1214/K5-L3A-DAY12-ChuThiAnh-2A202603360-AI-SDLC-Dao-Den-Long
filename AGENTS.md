# Đảo Đèn Lồng

- Cài: `npm ci`. Chơi: `npm start`. Test: `npm test`.
- Phase 2 dùng Ticket-02 và Test Contract v1.1. Đọc `docs/phase-2.md` trước khi đổi gameplay.
- Giữ mô phỏng trong `src/game.mjs`/`src/game-v11.mjs` độc lập DOM, WebGL và đồng hồ thực; CLI và giao diện dùng `game.contract.json`.
- Chạy `node scripts/verify-phase1.mjs` để giữ hồi quy Phase 1. Chạy headless đủ đêm để xác nhận ngưỡng 30 giây.
- Giữ kiểm tra Phase 1 còn hiệu lực; ghi rõ trong `docs/phase-2.md` luật bị Ticket-02 thay thế và lý do cập nhật test.
- Ghi acceptance criteria, lệnh, kết quả thực tế và mục chưa kiểm tra vào tài liệu bằng chứng. Không tuyên bố đạt nếu chưa có kết quả thật.
- Không commit khóa, token, `.env`, `node_modules` hoặc output JSONL tạm.
