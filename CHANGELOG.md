# Changelog

## Phase 3 — Đèn cạn dầu

Thay đổi phá vỡ tương thích từ Test Contract v1.1 sang v1.2.

- Thời lượng ba Đêm đổi thành 240, 270 và 300 giây. Thắng chỉ được xét ở bình minh theo ngưỡng 60% đèn sáng. `dawn_survived` thay `all_lit`.
- Đèn sáng hao dầu và nhận châm dầu. Đèn từng sáng chỉ cần 5 đom đóm để thắp lại. Vùng an toàn chỉ tồn tại khi đèn còn ít nhất 30 dầu. Bóng Mực có thể chuyển sang `drain`.
- Snapshot có thêm `fuel`, `ever_lit`, `relit_count` và `player.capacity`. Scenario chấp nhận `fuel`, `ever_lit`, `successful_lights` và `target_lantern_id`.
- Sự kiện `lantern_lit` thêm `relight`. Thêm `refuel`, `lantern_out` và `fuel_drain`.
- Sức chứa tăng theo lần thắp, tối đa 20. Điểm nạp và thắp đổi, thêm điểm châm dầu, ngắt hút dầu và thưởng dầu lúc bình minh. Thưởng thời gian bị bỏ.
- Giao diện có thanh dầu, hình dáng riêng cho đèn tắt và tùy chọn bảng màu dễ phân biệt.
