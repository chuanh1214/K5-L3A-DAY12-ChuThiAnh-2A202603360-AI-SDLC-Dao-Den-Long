# Phase 2 — Ticket-02, Test Contract v1.1

## Quyết định và thay đổi so với Phase 1

- Ticket-02 thay mọi tuning tự chọn ở Phase 1 bằng số liệu chuẩn trong `game.contract.json`; `phase-1` giữ nguyên lịch sử và cấu hình v1.0 ở tag cũ.
- Các thay đổi ảnh hưởng test Phase 1: sức chứa giữ ở 10 nhưng chi phí đèn đổi 6 → 10; bán kính nhặt 1.2 → 1 m; Tỏa Sáng đổi 2 đom đóm/6 m/1 s thành 3 đom đóm/5 m/3 s; vùng an toàn đổi 4 → 6 m; tốc độ Bóng Mực đổi 3 → 4 m/s.
- Luật mất đom đóm khi bị đánh đổi từ không rơi thành rơi `floor(mang / 2)`; mép đảo từ chặn người chơi thành rơi và hồi sinh; điểm đom đóm đổi từ lúc nhặt sang lúc nạp vào đèn. Test v1.0 khẳng định các luật cũ này được thay thế; các test về tick, input giữ trạng thái, tính tất định, output và mã lỗi vẫn được giữ.
- Bản thường giữ logic 60 Hz. Các màn trình duyệt là lớp hiển thị và gọi chung mô phỏng với CLI.

## Acceptance criteria và truy vết

| Yêu cầu | Tiêu chí nghiệm thu | Kiểm chứng |
|---|---|---|
| Điều khiển chuẩn | Chạy 6 m/s, đổi tốc độ trong ≤0.1 s, điều khiển đủ trên không; nhảy chỉ khi chạm đất; lướt 14 m/s trong 12 tick, hồi chiêu 90 tick từ lúc bắt đầu, đúng hướng và không bất tử. | `test/headless.test.mjs`: movement/dash scenario; chơi thử bằng WASD, Space, Shift. |
| Thu thập, đèn, điểm | Nhặt trong XZ ≤1 m và chênh cao ≤1.5 m; sức chứa 10; 20 điểm ban đầu, tối đa 30, thử sinh lại tick 240; nạp 10/đèn theo đèn gần nhất, hòa thì ID nhỏ; chỉ cộng điểm khi nạp. | CLI: pickup/deposit scenario, spawn tick 240, đọc `motes` và `score`. |
| Tỏa Sáng và Bóng Mực | Tâm pulse là chân +0.8 m, bán kính 3D 5 m, giá 3, hồi chiêu 180 tick; choáng 120 tick và đẩy tổng 4 m/15 tick; Bóng có trạng thái contract, phát hiện/bỏ đuổi 12/18 m, spawn đúng lịch, đánh tối đa một lần/tick. | CLI: scenario pulse/đánh/spawn; snapshot và event được so sánh trong test. |
| Vùng an toàn | Đèn sáng chặn Bóng Mực ở bán kính XZ 6 m; Bóng bị đẩy ra không gây hit trong thời gian sơ tán tối đa 30 tick. | CLI: dựng Bóng ở trong/ngoài vùng và thắp đèn. |
| Rơi khỏi đảo | Khi Y < −10, trừ một Ngọn Lửa dù đang bất tử, mất toàn bộ đom đóm, đợi 60 tick rồi hồi sinh tại gốc; trong thời gian chờ không nhặt hoặc bị chạm; hết lửa thì thua ngay. | CLI: di chuyển khỏi đảo với scenario có đồ mang theo; kiểm tra `player_hit` và snapshot hồi sinh. |
| Ba bản đồ | Đêm 1 có đảo bán kính 40 m/5 đèn; Đêm 2 có hai đảo, cầu tre, hai bục nhảy và 6 đèn; Đêm 3 có ba tầng, dốc, tháp, bục nhảy và 7 đèn. | Headless xác nhận bản đồ, số đèn, pad và vị trí. Test leo dốc mới chưa đạt: sau 60 tick, người chơi còn ở y=0 thay vì lên tầng giữa; cần sửa và chạy lại. |
| Gió Lạc | Đêm 2/3 sinh theo lịch, tối đa 2; trạng thái idle/chase/flee/removed, cướp tối đa 3, pulse khiến flee hoặc trả đồ khi đang flee. | CLI scenario cho cướp và trả đom đóm; kiểm tra event và snapshot. |
| Bùa Gió | Nhặt bùa đúng phạm vi; hiệu lực 600 tick, tăng chạy lên 7.2 m/s, lướt không hồi chiêu; xuất hiện lại sau 2700 tick. | CLI scenario bùa và input chạy/lướt; kiểm tra event/timer/velocity. |
| Chuỗi Đêm, tạm dừng, cài đặt | Menu → giới thiệu Đêm → chơi → kết quả → Đêm tiếp hoặc chơi lại; tổng điểm là tổng Đêm thắng. Esc/P dừng sim tick, thời gian và bộ đếm; có Tiếp tục/Chơi lại/Cài đặt/Về menu. Âm lượng/độ nhạy chuột lưu qua lần mở. | Chơi thử các đường thắng/thua, tạm dừng và tải lại trang. |
| Âm thanh và HUD | Có nền âm và hiệu ứng cho nhặt, thắp, pulse, hit, nhảy, dash, kết quả, spawn và đếm ngược; HUD có lửa, timer, đèn/điểm, 10 ô đom đóm, cooldown, prompt và mũi tên chỉ đèn. Hướng dẫn Q cố định ở thanh dưới; không hiện popup giải thích. | Chơi thử trong trình duyệt; kiểm tra prompt/arrow khi đến gần và ngoài màn hình, nghe lại nhạc/hiệu ứng. |
| Màu sắc và hiệu năng | Màu thành phần theo bảng ticket trong sai lệch tối đa 10% mỗi kênh; ambient = `0.15 + 0.55 × lit/total`. Bản thường đạt trung bình ≥30 FPS ở 1280×720. | Đối chiếu màu/độ sáng trong trình duyệt; ghi FPS, kích thước viewport và cấu hình máy. |
| Contract v1.1 | `--night` nhận 1–3; snapshot có trường bắt buộc; scenario/input được validate; JSONL deterministic; full night ≤30 giây. | `npm test`, `node scripts/verify-phase1.mjs` và các lệnh headless trong README. |

## Bằng chứng chạy

| Lệnh/kiểm tra | Kết quả thực tế | Trạng thái |
|---|---|---|
| `npm test` | Lần đầu người dùng chạy: 14/15 đạt; test vùng an toàn phát hiện Bóng Mực trùng tâm đèn không được đẩy ra. Sau khi thêm hướng dự phòng +X và bổ sung đo đủ ba Đêm, lần chạy lại đạt 15/15 (20.6 giây); từng Đêm dưới 30 giây. Lần chạy mới nhất đạt 14/15 sau 467 giây; test `dawn terminates...` lỗi khi đọc `first.events` vì tiến trình CLI con trả mã khác 0, chưa cô lập được nguyên nhân. | Lần chạy trước đạt; lần mới nhất thất bại, cần kiểm tra lại |
| `node scripts/verify-phase1.mjs` | Lần đầu thất bại cùng test trên. Sau khi sửa, `hello-headless` đạt, toàn bộ 15 test đạt (23.7 giây); mã thoát 0. | Đạt lần chạy lại |
| Headless mỗi Đêm | Trước bản sửa vùng an toàn, các end record là Đêm 1: tick 18.000, thua bình minh; Đêm 2: tick 19.800, thua bình minh; Đêm 3: tick 7.707, thua hết lửa. Sau bản sửa, suite tự động chạy đủ 3 Đêm và xác nhận end tick cùng giới hạn 30 giây. | Đạt trong suite; CLI riêng chưa chạy lại |
| Chơi thử trình duyệt | Người dùng xác nhận mặt cỏ và đất ba Đêm đã bình thường. Ảnh Đêm 3 cho thấy mặt vòng tầng giữa không thấy từ trên do winding/loại mặt; đã đảo normal/cung nửa vòng. Đã thêm bệ chân và thanh treo chuông, nới hành lang dốc mô phỏng lên ±5° và mặt dốc 3D lên 5.3 m. Người dùng vẫn không leo được. Lệnh `node --test --test-name-pattern="Night 3 ramp supports" test/headless.test.mjs` thất bại: vị trí cuối `[19.482, 0, 13.141]`, chưa lên cao độ tầng giữa. Chưa xác nhận trực quan sau các sửa đổi mới; nguyên nhân leo dốc còn tồn tại. `?testAllNights=1` mở tạm cả ba màn, không ghi đè tiến trình. | Chưa đạt; cần sửa dốc và kiểm tra lại tháp |
| Đo trung bình FPS 1280×720 | Người dùng báo FPS avg 26 trước tối ưu; sau khi hạ pixel ratio tối đa xuống 0.85, báo 32 khi lướt/di chuột, 42 khi chơi ở cửa sổ lớn và 38 sau 1,2 phút chơi. Sau đó báo kích thước hiện tại 1336×768; chưa xác nhận đây là kích thước viewport CSS của Chrome tại đúng lần đo. | Đã có báo cáo 38 FPS ở thời lượng 1,2 phút; chưa xác nhận chính xác viewport 1280×720 |

Không ghi mục nào là đạt cho đến khi lệnh hoặc kiểm tra tương ứng thực sự chạy và kết quả được cập nhật tại đây.
