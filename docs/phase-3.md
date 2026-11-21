# Phase 3 — Đèn cạn dầu

## Quyết định thiết kế

Mô phỏng giữ dầu theo đơn vị nguyên 1/60. Mỗi tick đang chơi trừ 1 đơn vị nguyên cho hao tự nhiên và 5 cho mỗi Bóng Mực đang hút. Một Bóng báo `fuel_drain` sau mỗi 60 tick hút liên tục. Nếu hết dầu, mô phỏng đặt lượng dầu và phần đom đóm đã nạp về 0, đồng thời giữ `ever_lit` để lần thắp sau chỉ cần 5 đom đóm. Đèn châm lại tới đúng 30 dầu khôi phục vùng an toàn. Khi tạm dừng, dầu và bộ đếm hút đứng yên.

Mô phỏng xét thắng ở cuối tick bình minh, sau khi đã xử lý cạn dầu, tương tác và sát thương. Mây phải còn ít nhất một Ngọn Lửa và giữ tối thiểu 3/5, 4/6 hoặc 5/7 đèn sáng. Thưởng bình minh dùng phần nguyên của dầu tại thời điểm chấm. Đèn do scenario đặt sẵn không tăng số lần thắp của người chơi.

## Tiêu chí và bằng chứng

| Tiêu chí | Xác minh |
|---|---|
| Hao dầu theo tick, tắt và thắp lại, châm dầu làm tròn lên, chọn đèn theo khoảng cách và ID | Test CLI kiểm tra tắt và thắp lại cùng tick, châm tối đa 100 và ưu tiên ID nhỏ khi bằng khoảng cách. |
| Bóng Mực chọn đèn yếu, nhiều con hút cộng dồn, đổi trạng thái khi có người hoặc bị Tỏa Sáng | Test CLI kiểm tra wander → drain → chase, tổng hao 11 dầu/giây khi hai Bóng hút, sự kiện theo từng Bóng, thưởng 15 và khôi phục an toàn ở đúng 30 dầu. |
| Bình minh quyết định theo đèn còn sáng, hết lửa luôn thua | Test CLI kiểm tra không thắng sớm, thắng đúng tick cuối, đèn vừa tắt làm hụt ngưỡng và `no_flames` được ưu tiên. |
| Sức chứa và điểm | Test CLI kiểm tra sức chứa 10 → 12, trần 20, chi phí và điểm thắp lại, châm dầu, Tỏa Sáng và thưởng bình minh. |
| Thanh dầu, đèn tắt xẹp và có vết rách, nhấp nháy 1 Hz, bảng màu dễ phân biệt được lưu | Chrome headless xác nhận WebGL2, thanh dầu, nhịp nháy, hình học đèn tắt, HUD sức chứa, màu mắt Bóng, biểu tượng cảnh báo và giá trị lưu trong localStorage. Bài thử dùng trạng thái dựng sẵn. Chưa chơi thủ công hết ba Đêm. |

## Cập nhật kiểm thử cũ

Test nạp đèn giữ kiểm tra số đom đóm và bổ sung cờ `relight`. Test tạm dừng đọc thời lượng từ contract và kiểm tra dầu đứng yên. Test chạy đủ Đêm dùng 14.400, 16.200 và 18.000 tick tương ứng thời lượng mới. Các test về di chuyển, Tỏa Sáng, vùng an toàn của đèn đủ dầu, hồi sinh, gió, bùa, Gió Lạc và tính tất định vẫn chạy.

## Lệnh và kết quả

- `node scripts/verify-phase1.mjs` chạy thành công `hello-headless` và 25/25 test trong 6,35 giây. Test chạy đủ ba Đêm theo thời lượng mới mất 0,56 giây tổng cộng và xác nhận mỗi lượt dưới 30 giây.
- `node --check src/browser-v11.mjs` và `git diff --check` chạy thành công.
- Chrome headless chạy WebGL2 bằng SwiftShader trên bản phục vụ cục bộ. Bài thử mở Đêm 1, dựng trạng thái dầu và bật tùy chọn màu qua sự kiện giao diện. Kết quả PASS cho các mục trình duyệt trong bảng. Bộ test ẩn của giảng viên chưa chạy.
