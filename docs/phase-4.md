# Phase 4 — Bình minh

## Tiêu chí kiểm chứng

| Hạng mục | Kiểm tra |
|---|---|
| Benchmark | Cảnh Đêm 1 có 200 Bóng Mực wander, 100 đom đóm, L1–L3 đầy dầu và Mây đứng tại gốc. Camera chạy một vòng trong 15 giây. Lệnh chuẩn làm nóng 3 giây rồi đo 30 giây. |
| Soak | 10 Đêm trong cùng tiến trình, seed 7–16, hướng mới mỗi 30 tick, các nút lấy mẫu ngẫu nhiên mỗi tick. Dùng RSS sau khi tải Đêm đầu và sau khi đã giải phóng Đêm cuối. |
| Bảng điểm | Kiểm tra tên, sắp xếp và cắt top 10, đọc lại từ đĩa và xuất JSON bằng lệnh chạy. |
| Trợ năng | Kiểm tra thông báo Bóng Mực, gió, 10 giây cuối và dầu thấp; đổi phím và kiểm tra trùng; giảm chuyển động và chữ lớn. |

## Kết quả

- `node scripts/verify-phase1.mjs` chạy `hello-headless` và đạt 31/31 test trong khoảng 6,85 giây. Test chạy đủ ba Đêm đạt dưới 30 giây mỗi Đêm. Chưa chạy bộ test ẩn của giảng viên.
- `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` đo Chrome cửa sổ ở 1280×720 trên Windows. Kết quả là 59,9957 FPS trung bình, 59,2639 FPS 1% low, p95 16,8 ms và tải 1.546 ms. FPS trung bình thấp hơn ngưỡng 60 khoảng 0,0043 FPS. Hai ngưỡng còn lại đạt. WebGL giữ đồng bộ khung hình của trình duyệt; chưa đo trên máy chấm. Xem [bench.json](../bench.json).
- `node --expose-gc --jitless --max-semi-space-size=1 scripts/soak.mjs --seed 7 --nights 10 --out soak.json` chạy được 10 Đêm trong 2,32 giây, 0 crash. RSS tăng từ 34,44 lên 35,95 MiB, tương đương khoảng 4,38%, dưới ngưỡng 20%. Cả 10 lượt input ngẫu nhiên kết thúc thua. Xem [soak.json](../soak.json).
- Test bảng điểm xác nhận tên sai trả 400, hai lượt bằng điểm giữ thứ tự, giới hạn top 10 và xuất lại JSON từ tiến trình khác. Chrome headless xác nhận đổi phím, báo trùng, lưu và khôi phục, bật chữ lớn 22,5 px, bật giảm chuyển động, và đọc điểm đã lưu qua màn Bảng xếp hạng. Chưa chơi thủ công đủ ba Đêm với tất cả cấu hình trợ năng.
- Video dùng một scenario có hai đom đóm và một đèn ở gần để minh họa thao tác thật trong Chrome, sau đó hiện số đo đã chạy. Video ghi trước khi bổ sung test benchmark, nên hiện 30 test đạt; suite bàn giao hiện có 31 test.
- Bản sao nguồn trong thư mục trống cài được với `npm ci` và chạy đạt 31/31 test. ZIP giải nén chạy được server với thư viện Three.js đi kèm. Đã xác nhận trang chính, module giao diện, module Three.js và API bảng điểm trả HTTP 200 từ bản ZIP.

## Retro

**Phase 1.** Tách mô phỏng 60 Hz khỏi WebGL ngay từ đầu giúp CLI và giao diện dùng cùng luật. Scenario ngắn làm rõ những chỗ PRD chưa định lượng. Lỗi cài npm qua shim Windows cho thấy bản clone sạch cần được xác minh với đúng lệnh trong README.

**Phase 2.** Các kịch bản tách riêng dốc, tầng cao và bục nhảy giúp xác định đúng bước bị lỗi. Kiểm tra theo tâm nhân vật để lọt phần thân vào vách. Mở rộng va chạm theo bề ngang lại gây kẹt khi cả bước ngang bị hủy. Bài thử Chrome tìm ra trường hợp bước cuối rời mặt dốc nhưng chưa đáp lên tầng giữa, từ đó thêm test hồi quy.

**Phase 3.** Dầu dưới dạng số nguyên theo tick giúp kiểm chứng đúng mốc 30 và tick bình minh. Thứ tự tắt đèn trước tương tác và trừ Ngọn Lửa trước xét thắng cần test trực tiếp. Điều kiện kiểm tra điểm xuất phát trong Chrome từng quá chặt vì yêu cầu XZ đứng yên dù gió đang đẩy theo phương ngang.

**Phase 4.** Benchmark và soak đo hai loại chi phí khác nhau. Lượt soak với cấu hình Node mặc định không crash nhưng tăng RSS trên máy này. Lệnh chính thức chạy Node với heap thế hệ trẻ nhỏ và chế độ không JIT để giảm tăng RSS do khởi động máy ảo. Lệnh gọi GC tại hai mốc đo và dùng cùng cấu hình cho mọi Đêm. Bảng điểm ghi ra đĩa thay thư viện lưu trữ bổ sung; trường dữ liệu và lỗi tên được kiểm tra ở server.

`AGENTS.md` có tác dụng nhất ở ba việc: luôn giữ mô phỏng headless độc lập, chạy hồi quy trước bàn giao và chỉ ghi kết quả đã đo. Bản ghi Phase 1 ước tính 10.000–20.000 token. Không có thống kê token hoặc chi phí đầy đủ cho Phase 2–4, nên tổng chi phí chưa xác định. Những lượt sửa dùng log ngắn, scenario nhỏ và tiếp tục trên test hiện có để tiết kiệm ngữ cảnh. Nếu làm lại, sẽ kiểm tra đường đi trong trình duyệt ngay khi thêm tầng cao và lưu kịch bản benchmark trước khi chọn cài đặt render.
