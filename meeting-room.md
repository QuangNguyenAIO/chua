Dưới đây là tài liệu RSD (Requirement Specification Document) – Đặc tả yêu cầu phần mềm cho module PHÒNG HỌP ẢO (Virtual Meeting Room). Tài liệu được xây dựng theo hướng đặc tả nghiệp vụ và chức năng, làm cơ sở để triển khai UI/UX, Frontend, Backend, 3D Environment và Multiplayer.

# RSD – MODULE PHÒNG HỌP ẢO (VIRTUAL MEETING ROOM)



Draft v1.0

New Module



| Thông tin         | Nội dung                              |
| ----------------- | ------------------------------------- |
| Tên tài liệu      | Requirement Specification Document    |
| Tên module        | Phòng họp ảo                          |
| Module Code       | VRM – Virtual Meeting Room            |
| Phiên bản         | 1.0                                   |
| Loại hệ thống     | 3D Multiplayer Collaboration          |
| Nền tảng          | Web / PC                              |
| Góc nhìn          | Third-person                          |
| Đối tượng sử dụng | Host, Co-host, Presenter, Participant |
| Trạng thái        | Draft                                 |

## 1. Mục đích tài liệu

Tài liệu mô tả các yêu cầu nghiệp vụ, yêu cầu chức năng, yêu cầu phi chức năng và yêu cầu giao diện của module Phòng họp ảo.

Mục tiêu xây dựng module:

- Mô phỏng không gian phòng họp thực tế trong môi trường 3D.
- Cho phép nhiều người dùng tham gia đồng thời thông qua avatar.
- Hỗ trợ giao tiếp bằng âm thanh, hình ảnh và tin nhắn.
- Hỗ trợ trình chiếu, chia sẻ tài liệu và cộng tác trực tiếp.
- Hỗ trợ quản lý, điều hành và kiểm soát cuộc họp.
- Lưu trữ lịch sử, biên bản và kết quả cuộc họp.

## 2. Phạm vi hệ thống

### 2.1. Trong phạm vi (In Scope)

| STT | Nhóm chức năng     | Mô tả                                     |
| --- | ------------------ | ----------------------------------------- |
| 1   | Quản lý phòng họp  | Tạo, sửa, xóa, đóng, mở phòng             |
| 2   | Tham gia phòng họp | Tham gia bằng mã phòng hoặc lời mời       |
| 3   | Không gian 3D      | Mô phỏng phòng họp, bàn, ghế, màn hình    |
| 4   | Avatar             | Tạo và điều khiển nhân vật                |
| 5   | Giao tiếp          | Voice Chat, Text Chat, Video Call         |
| 6   | Quản lý thành viên | Danh sách, vai trò, quyền hạn             |
| 7   | Trình chiếu        | Chia sẻ màn hình và tài liệu              |
| 8   | Whiteboard         | Bảng trắng cộng tác                       |
| 9   | Điều hành họp      | Micro, camera, khóa phòng, mời thành viên |
| 10  | Biểu quyết         | Voting, Polling                           |
| 11  | Ghi nhận cuộc họp  | Ghi âm, ghi hình, điểm danh               |
| 12  | Biên bản           | Ghi chú, kết luận, Action Items           |
| 13  | Lịch họp           | Lên lịch và nhắc lịch                     |
| 14  | Lịch sử            | Tra cứu cuộc họp đã diễn ra               |

### 2.2. Ngoài phạm vi (Out of Scope)

- Tích hợp sâu với hệ thống ERP/CRM bên ngoài.
- Chữ ký số biên bản cuộc họp.
- AI nhận diện cảm xúc người tham gia.
- AI phân tích nội dung chuyên sâu theo từng lĩnh vực nghiệp vụ.

Các nội dung này có thể được phát triển ở các phiên bản tiếp theo.

## 3. Đối tượng và vai trò người dùng

| Vai trò      | Mô tả                               |
| ------------ | ----------------------------------- |
| System Admin | Quản trị toàn bộ hệ thống phòng họp |
| Host         | Người tạo và chủ trì cuộc họp       |
| Co-host      | Người hỗ trợ điều hành cuộc họp     |
| Presenter    | Người được cấp quyền trình bày      |
| Participant  | Người tham gia cuộc họp             |
| Guest        | Khách tham gia qua lời mời          |

### 3.1. Ma trận phân quyền

| Chức năng            | Admin | Host | Co-host | Presenter | Participant |
| -------------------- | ----- | ---- | ------- | --------- | ----------- |
| Tạo phòng            | ✓     | ✓    | –       | –         | –           |
| Sửa cấu hình phòng   | ✓     | ✓    | ✓\*     | –         | –           |
| Khóa/mở phòng        | ✓     | ✓    | ✓       | –         | –           |
| Mời thành viên       | ✓     | ✓    | ✓       | –         | –           |
| Loại thành viên      | ✓     | ✓    | ✓       | –         | –           |
| Tắt micro người khác | ✓     | ✓    | ✓       | –         | –           |
| Trình chiếu          | ✓     | ✓    | ✓       | ✓         | ✓\*         |
| Sử dụng Whiteboard   | ✓     | ✓    | ✓       | ✓         | ✓\*         |
| Biểu quyết           | ✓     | ✓    | ✓       | –         | ✓           |
| Ghi hình             | ✓     | ✓    | ✓\*     | –         | –           |
| Kết thúc cuộc họp    | ✓     | ✓    | –       | –         | –           |

\*Phụ thuộc quyền được Host cấp.

## 4. Mô tả quy trình nghiệp vụ tổng thể

\#chatgpt-mermaid-\_r_rk\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_rk\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_rk\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_rk\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_rk\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_rk\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_rk\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_rk\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_rk\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_rk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_rk\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_rk\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_rk\_ p{margin:0;}#chatgpt-mermaid-\_r_rk\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_rk\_ .label text,#chatgpt-mermaid-\_r_rk\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .node rect,#chatgpt-mermaid-\_r_rk\_ .node circle,#chatgpt-mermaid-\_r_rk\_ .node ellipse,#chatgpt-mermaid-\_r_rk\_ .node polygon,#chatgpt-mermaid-\_r_rk\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .rough-node .label text,#chatgpt-mermaid-\_r_rk\_ .node .label text,#chatgpt-mermaid-\_r_rk\_ .image-shape .label,#chatgpt-mermaid-\_r_rk\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_rk\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .rough-node .label,#chatgpt-mermaid-\_r_rk\_ .node .label,#chatgpt-mermaid-\_r_rk\_ .image-shape .label,#chatgpt-mermaid-\_r_rk\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_rk\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_rk\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_rk\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_rk\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_rk\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_rk\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_rk\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_rk\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_rk\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_rk\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_rk\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_rk\_ .icon-shape,#chatgpt-mermaid-\_r_rk\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_rk\_ .icon-shape p,#chatgpt-mermaid-\_r_rk\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_rk\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_rk\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_rk\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_rk\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_rk\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_rk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_rk\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_rk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_rk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rk\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_rk\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_rk\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_rk\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_rk\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_rk\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_rk\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .node rect,#chatgpt-mermaid-\_r_rk\_ .node circle,#chatgpt-mermaid-\_r_rk\_ .node ellipse,#chatgpt-mermaid-\_r_rk\_ .node polygon,#chatgpt-mermaid-\_r_rk\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_rk\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_rk\_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_rk\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_rk\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_rk\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Người dùng đăng nhậpTruy cập Phòng họp ảoLựa chọnCấu hình phòng họpNhập mã phòng / Link mờiChọn cuộc họp đã lên lịchKhởi tạo phòng 3DKiểm tra quyền truy cậpVào phòng chờKhởi tạo AvatarTham gia không gian họpGiao tiếp / Trình chiếu / CộngtácKết thúc cuộc họpLưu lịch sử và biên bảnTạo phòngTham giaLịch họp

## 5. Đặc tả yêu cầu chức năng (Functional Requirements)

Quy ước mã yêu cầu: `FR-VRM-XXX`.

### 5.1. FR-VRM-001 – Quản lý phòng họp

Mô tả: Hệ thống cho phép người dùng tạo và quản lý các phòng họp ảo.

| ID        | Tên chức năng            | Mô tả yêu cầu                                    | Ưu tiên |
| --------- | ------------------------ | ------------------------------------------------ | ------- |
| FR-001.01 | Tạo phòng họp            | Cho phép người dùng tạo phòng họp mới            | High    |
| FR-001.02 | Đặt tên phòng            | Nhập tên phòng họp                               | High    |
| FR-001.03 | Mô tả phòng              | Nhập nội dung, mục đích cuộc họp                 | Medium  |
| FR-001.04 | Thiết lập mật khẩu       | Cấu hình mật khẩu truy cập                       | High    |
| FR-001.05 | Thiết lập quyền riêng tư | Công khai hoặc riêng tư                          | High    |
| FR-001.06 | Giới hạn thành viên      | Cấu hình số lượng người tham gia tối đa          | High    |
| FR-001.07 | Chọn mẫu phòng           | Lựa chọn phòng nhỏ, phòng tiêu chuẩn, hội trường | Medium  |
| FR-001.08 | Chỉnh sửa phòng          | Cập nhật thông tin phòng                         | High    |
| FR-001.09 | Xóa phòng                | Xóa phòng họp theo quyền hạn                     | Medium  |
| FR-001.10 | Khóa phòng               | Ngăn người mới tham gia                          | High    |
| FR-001.11 | Sao chép liên kết        | Tạo và sao chép link mời                         | High    |
| FR-001.12 | Mã phòng                 | Sinh mã định danh duy nhất                       | High    |

Business Rules:

- Mỗi phòng họp phải có mã định danh duy nhất.
- Chỉ Host hoặc Admin được phép xóa phòng.
- Phòng riêng tư yêu cầu xác thực quyền truy cập.
- Phòng đang diễn ra không được xóa trực tiếp.
- Hệ thống phải kiểm tra giới hạn số lượng thành viên trước khi cho phép tham gia.

### 5.2. FR-VRM-002 – Tham gia và rời phòng họp

| ID        | Tên chức năng        | Mô tả yêu cầu                         | Ưu tiên |
| --------- | -------------------- | ------------------------------------- | ------- |
| FR-002.01 | Tham gia bằng mã     | Nhập mã phòng để tham gia             | High    |
| FR-002.02 | Tham gia bằng link   | Truy cập thông qua đường dẫn mời      | High    |
| FR-002.03 | Phòng chờ            | Người tham gia chờ Host phê duyệt     | High    |
| FR-002.04 | Xác thực             | Kiểm tra quyền tham gia               | High    |
| FR-002.05 | Kiểm tra thiết bị    | Kiểm tra micro, camera, loa           | High    |
| FR-002.06 | Chọn avatar          | Lựa chọn nhân vật trước khi vào phòng | Medium  |
| FR-002.07 | Chọn vị trí          | Lựa chọn vị trí xuất hiện trong phòng | Medium  |
| FR-002.08 | Rời phòng            | Người dùng chủ động rời cuộc họp      | High    |
| FR-002.09 | Kết nối lại          | Tự động kết nối lại khi mất mạng      | High    |
| FR-002.10 | Thông báo thành viên | Thông báo khi có người vào/rời phòng  | Medium  |

Business Rules:

- Người dùng không có quyền truy cập không được vào phòng riêng tư.
- Host có thể phê duyệt hoặc từ chối người trong phòng chờ.
- Khi Host rời phòng, hệ thống phải hỗ trợ chuyển quyền Host hoặc kết thúc phòng theo cấu hình.
- Khi mất kết nối, hệ thống giữ trạng thái tham gia trong một khoảng thời gian cấu hình được để hỗ trợ reconnect.

### 5.3. FR-VRM-003 – Không gian phòng họp 3D

Mô tả: Hệ thống mô phỏng môi trường phòng họp thực tế với khả năng tương tác trực tiếp.

[El metaverso llega a Teams con “gemelos digitales” y entornos 3D para las reuniones](https://images.openai.com/static-rsc-4/oFcKDbxHc7Sdp2P7uPH6-YWSq4zfIneZoCA9c_kOW4fuGjui6W-JrJBrS9V_aEUfCUT1-ijCU6kFTElxsXIb1_Hr3ZWT1s9L3gGIEXz5whPxpDaLwbe3mCKXkm8BFwNaHCWqszuxfrpKzMoWeqTT3E3vjMmeUxkhk_u8sk6padI?purpose=inline)

[Hybrid Work Audiovisual Solutions](https://images.openai.com/static-rsc-4/O0dgIcBitpKLfH7HO-oaWo2O8D7tVOmaxcH4CGqCRoSv6YKWMMZUZ-sSeqscaWp6wypPaWYVMWTi1LvH2xUS11rlJ52aFCFEqtodsyRUVEyvllExSOv3zxTV_Q7tcG8gn3dECX_hL-WpTueZavfJh0hnHVBdYamvY2Mln9DXfh0?purpose=inline)

[Toch op afstand scrummen en brainstormen? Dit zijn de mogelijkheden](https://images.openai.com/static-rsc-4/hnx-vgufwCxLB3bgmP8HblISuwRNocJODHl7rGLd8ygdYSI9cQKKd1kAFt8gmg0qymoxrY0tUBd3e14IYkbm_Lj4zognEaMMX5fPd46UIvNdiaj_Wwpcm5gPstwWrm2m_Sk8y6P_3Y3WkpIyDUVPO4QKfYzdTwy6MCv2eX7mrqA?purpose=inline)

13

| ID        | Đối tượng           | Yêu cầu chức năng                              |
| --------- | ------------------- | ---------------------------------------------- |
| FR-003.01 | Không gian phòng    | Hiển thị môi trường 3D                         |
| FR-003.02 | Bàn họp             | Có thể tương tác và bố trí vị trí              |
| FR-003.03 | Ghế ngồi            | Cho phép avatar ngồi và đứng lên               |
| FR-003.04 | Màn hình            | Hiển thị nội dung trình chiếu                  |
| FR-003.05 | Bảng trắng          | Cho phép tương tác trực tiếp                   |
| FR-003.06 | Cửa phòng           | Mô phỏng đóng/mở                               |
| FR-003.07 | Camera              | Hỗ trợ thay đổi góc nhìn                       |
| FR-003.08 | Ánh sáng            | Điều chỉnh theo cấu hình phòng                 |
| FR-003.09 | Vật thể             | Tương tác với các đồ vật trong phòng           |
| FR-003.10 | Âm thanh môi trường | Mô phỏng âm thanh trong không gian             |
| FR-003.11 | Điều khiển camera   | Xoay, zoom, di chuyển camera                   |
| FR-003.12 | Đồng bộ 3D          | Đồng bộ trạng thái vật thể giữa các thành viên |

### 5.4. FR-VRM-004 – Quản lý Avatar

| ID        | Tên chức năng    | Mô tả                                           |
| --------- | ---------------- | ----------------------------------------------- |
| FR-004.01 | Tạo Avatar       | Tạo nhân vật đại diện người dùng                |
| FR-004.02 | Tùy chỉnh Avatar | Thay đổi ngoại hình, trang phục                 |
| FR-004.03 | Di chuyển        | Di chuyển tự do trong phòng                     |
| FR-004.04 | Chạy/Đi bộ       | Điều khiển tốc độ di chuyển                     |
| FR-004.05 | Ngồi xuống       | Avatar có thể ngồi vào ghế                      |
| FR-004.06 | Đứng lên         | Avatar có thể đứng dậy                          |
| FR-004.07 | Biểu cảm         | Biểu cảm khuôn mặt                              |
| FR-004.08 | Animation        | Các hoạt ảnh tương tác                          |
| FR-004.09 | Hiển thị tên     | Hiển thị tên trên Avatar                        |
| FR-004.10 | Trạng thái       | Hiển thị đang nói, đang nghe, đang trình bày    |
| FR-004.11 | Đồng bộ          | Đồng bộ vị trí và hành động theo thời gian thực |

Các thao tác Avatar:

- Đi bộ, chạy, xoay người.
- Ngồi, đứng, di chuyển ghế.
- Giơ tay xin phát biểu.
- Gật đầu, lắc đầu, vẫy tay.
- Vỗ tay, chỉ tay, biểu đạt cảm xúc.
- Đứng cạnh màn hình để thuyết trình.

### 5.5. FR-VRM-005 – Giao tiếp âm thanh và hình ảnh

| ID        | Tên chức năng     | Mô tả                            | Ưu tiên  |
| --------- | ----------------- | -------------------------------- | -------- |
| FR-005.01 | Voice Chat        | Giao tiếp bằng giọng nói         | Critical |
| FR-005.02 | Micro Control     | Bật/tắt micro                    | Critical |
| FR-005.03 | Speaker Control   | Điều chỉnh âm lượng loa          | High     |
| FR-005.04 | Camera Control    | Bật/tắt camera                   | High     |
| FR-005.05 | Video Stream      | Hiển thị video người tham gia    | High     |
| FR-005.06 | Spatial Audio     | Âm thanh theo khoảng cách avatar | High     |
| FR-005.07 | Push to Talk      | Nhấn giữ để phát biểu            | Medium   |
| FR-005.08 | Raise Hand        | Giơ tay xin phát biểu            | High     |
| FR-005.09 | Speaker Indicator | Hiển thị người đang nói          | High     |
| FR-005.10 | Noise Suppression | Giảm tiếng ồn                    | Medium   |
| FR-005.11 | Echo Cancellation | Khử tiếng vọng                   | High     |
| FR-005.12 | Device Selection  | Chọn thiết bị đầu vào/đầu ra     | High     |

Business Rules:

- Người dùng có thể tự tắt micro và camera.
- Host có quyền tắt micro của thành viên khác.
- Chỉ những người có quyền mới được phép phát biểu trong chế độ giới hạn phát biểu.
- Âm thanh không gian phải hỗ trợ xác định tương đối vị trí người nói.
- Camera phải có trạng thái bật/tắt rõ ràng.

### 5.6. FR-VRM-006 – Chat và tương tác

| ID        | Tên chức năng        | Mô tả                         |
| --------- | -------------------- | ----------------------------- |
| FR-006.01 | Public Chat          | Nhắn tin toàn phòng           |
| FR-006.02 | Private Chat         | Nhắn tin riêng                |
| FR-006.03 | Emoji                | Gửi biểu tượng cảm xúc        |
| FR-006.04 | Reaction             | Thả cảm xúc vào nội dung      |
| FR-006.05 | File Attachment      | Gửi tệp đính kèm              |
| FR-006.06 | Chat History         | Lưu lịch sử trao đổi          |
| FR-006.07 | Message Notification | Thông báo tin nhắn mới        |
| FR-006.08 | Message Moderation   | Quản lý và kiểm soát nội dung |

### 5.7. FR-VRM-007 – Trình chiếu và chia sẻ tài liệu

| ID        | Tên chức năng     | Mô tả                      |
| --------- | ----------------- | -------------------------- |
| FR-007.01 | Screen Sharing    | Chia sẻ màn hình           |
| FR-007.02 | Window Sharing    | Chia sẻ cửa sổ ứng dụng    |
| FR-007.03 | Upload Document   | Tải tài liệu lên phòng họp |
| FR-007.04 | PDF Viewer        | Hiển thị tài liệu PDF      |
| FR-007.05 | PowerPoint Viewer | Trình chiếu PowerPoint     |
| FR-007.06 | Image Viewer      | Hiển thị hình ảnh          |
| FR-007.07 | Video Player      | Phát video                 |
| FR-007.08 | Slide Navigation  | Chuyển trang trình chiếu   |
| FR-007.09 | Zoom              | Phóng to/thu nhỏ           |
| FR-007.10 | Presenter Control | Phân quyền người trình bày |
| FR-007.11 | Annotation        | Chú thích trên tài liệu    |
| FR-007.12 | Stop Sharing      | Dừng chia sẻ               |

Business Rules:

- Chỉ một người được quyền trình chiếu chính tại một thời điểm, trừ khi cấu hình cho phép nhiều luồng.
- Host có quyền thu hồi quyền trình chiếu.
- Người tham gia chỉ xem được tài liệu theo quyền được cấp.
- Hệ thống phải kiểm tra định dạng, dung lượng và tính an toàn của tệp tải lên.

### 5.8. FR-VRM-008 – Whiteboard

| ID        | Tên chức năng      | Mô tả                           |
| --------- | ------------------ | ------------------------------- |
| FR-008.01 | Create Board       | Tạo bảng trắng                  |
| FR-008.02 | Drawing            | Vẽ tự do                        |
| FR-008.03 | Text               | Thêm văn bản                    |
| FR-008.04 | Shape              | Thêm hình khối                  |
| FR-008.05 | Sticky Notes       | Tạo ghi chú                     |
| FR-008.06 | Image              | Chèn hình ảnh                   |
| FR-008.07 | Multi-user Editing | Nhiều người chỉnh sửa đồng thời |
| FR-008.08 | Undo/Redo          | Hoàn tác và khôi phục           |
| FR-008.09 | Save Board         | Lưu bảng trắng                  |
| FR-008.10 | Export Board       | Xuất PDF/PNG                    |

### 5.9. FR-VRM-009 – Quản lý và điều hành cuộc họp

| ID        | Tên chức năng  | Mô tả                         |
| --------- | -------------- | ----------------------------- |
| FR-009.01 | Member List    | Hiển thị danh sách thành viên |
| FR-009.02 | Assign Role    | Phân quyền thành viên         |
| FR-009.03 | Mute All       | Tắt micro toàn bộ             |
| FR-009.04 | Remove Member  | Loại thành viên khỏi phòng    |
| FR-009.05 | Lock Room      | Khóa phòng                    |
| FR-009.06 | Waiting Room   | Quản lý phòng chờ             |
| FR-009.07 | Transfer Host  | Chuyển quyền chủ trì          |
| FR-009.08 | Meeting Timer  | Đồng hồ cuộc họp              |
| FR-009.09 | Meeting Agenda | Quản lý chương trình họp      |
| FR-009.10 | End Meeting    | Kết thúc cuộc họp             |

### 5.10. FR-VRM-010 – Biểu quyết và khảo sát

| ID        | Tên chức năng    | Mô tả                          |
| --------- | ---------------- | ------------------------------ |
| FR-010.01 | Create Poll      | Tạo câu hỏi khảo sát           |
| FR-010.02 | Multiple Choice  | Cho phép chọn nhiều phương án  |
| FR-010.03 | Single Choice    | Chỉ chọn một phương án         |
| FR-010.04 | Anonymous Voting | Biểu quyết ẩn danh             |
| FR-010.05 | Voting Timer     | Thiết lập thời gian biểu quyết |
| FR-010.06 | Live Result      | Hiển thị kết quả trực tiếp     |
| FR-010.07 | Export Result    | Xuất kết quả                   |
| FR-010.08 | Close Poll       | Đóng biểu quyết                |

### 5.11. FR-VRM-011 – Ghi hình, ghi âm và điểm danh

| ID        | Tên chức năng      | Mô tả                   |
| --------- | ------------------ | ----------------------- |
| FR-011.01 | Start Recording    | Bắt đầu ghi hình        |
| FR-011.02 | Stop Recording     | Dừng ghi hình           |
| FR-011.03 | Audio Recording    | Ghi âm                  |
| FR-011.04 | Recording Storage  | Lưu trữ bản ghi         |
| FR-011.05 | Attendance         | Ghi nhận người tham gia |
| FR-011.06 | Join Time          | Ghi nhận thời gian vào  |
| FR-011.07 | Leave Time         | Ghi nhận thời gian ra   |
| FR-011.08 | Attendance Report  | Báo cáo điểm danh       |
| FR-011.09 | Recording Playback | Phát lại bản ghi        |
| FR-011.10 | Delete Recording   | Xóa bản ghi theo quyền  |

Business Rules:

- Phải thông báo cho người tham gia khi bắt đầu ghi hình/ghi âm.
- Việc ghi hình phải tuân thủ quyền truy cập và chính sách lưu trữ.
- Lịch sử điểm danh cần phân biệt thời gian tham gia nhiều lần.
- Chỉ người có quyền mới được xem hoặc tải bản ghi.

### 5.12. FR-VRM-012 – Biên bản cuộc họp và Action Items

| ID        | Tên chức năng   | Mô tả                       |
| --------- | --------------- | --------------------------- |
| FR-012.01 | Meeting Notes   | Ghi chú nội dung cuộc họp   |
| FR-012.02 | Meeting Minutes | Tạo biên bản cuộc họp       |
| FR-012.03 | Agenda          | Ghi nhận chương trình họp   |
| FR-012.04 | Discussion      | Ghi nhận nội dung thảo luận |
| FR-012.05 | Conclusion      | Ghi nhận kết luận           |
| FR-012.06 | Action Items    | Tạo danh sách công việc     |
| FR-012.07 | Assign Task     | Giao người phụ trách        |
| FR-012.08 | Due Date        | Thiết lập thời hạn          |
| FR-012.09 | Export PDF      | Xuất biên bản PDF           |
| FR-012.10 | Export DOCX     | Xuất biên bản DOCX          |
| FR-012.11 | Approval        | Xác nhận biên bản           |
| FR-012.12 | Version History | Lưu lịch sử chỉnh sửa       |

### 5.13. FR-VRM-013 – Lịch họp và thông báo

| ID        | Tên chức năng        | Mô tả                 |
| --------- | -------------------- | --------------------- |
| FR-013.01 | Create Schedule      | Tạo lịch họp          |
| FR-013.02 | Edit Schedule        | Sửa lịch              |
| FR-013.03 | Cancel Schedule      | Hủy lịch              |
| FR-013.04 | Invite Members       | Mời người tham gia    |
| FR-013.05 | Calendar View        | Hiển thị lịch         |
| FR-013.06 | Reminder             | Nhắc lịch họp         |
| FR-013.07 | Meeting Notification | Thông báo cuộc họp    |
| FR-013.08 | Recurring Meeting    | Thiết lập họp định kỳ |
| FR-013.09 | Meeting History      | Tra cứu lịch sử       |

### 5.14. FR-VRM-014 – Breakout Rooms

| ID        | Tên chức năng    | Mô tả                            |
| --------- | ---------------- | -------------------------------- |
| FR-014.01 | Create Sub-room  | Tạo phòng họp nhóm               |
| FR-014.02 | Assign Members   | Phân chia thành viên             |
| FR-014.03 | Move Members     | Chuyển thành viên giữa các phòng |
| FR-014.04 | Sub-room Timer   | Thiết lập thời gian              |
| FR-014.05 | Return Main Room | Quay về phòng chính              |
| FR-014.06 | Sub-room Report  | Tổng hợp kết quả nhóm            |

### 5.15. FR-VRM-015 – Trợ lý AI cuộc họp

| ID        | Tên chức năng     | Mô tả                           |
| --------- | ----------------- | ------------------------------- |
| FR-015.01 | Speech-to-Text    | Chuyển giọng nói thành văn bản  |
| FR-015.02 | Live Caption      | Hiển thị phụ đề                 |
| FR-015.03 | Meeting Summary   | Tổng hợp nội dung               |
| FR-015.04 | Key Points        | Trích xuất ý chính              |
| FR-015.05 | Action Extraction | Đề xuất công việc cần thực hiện |
| FR-015.06 | Translation       | Dịch nội dung                   |
| FR-015.07 | Search Transcript | Tìm kiếm nội dung cuộc họp      |

Các tính năng AI phải được người dùng cho phép trước khi thu thập và xử lý nội dung âm thanh, hình ảnh hoặc văn bản.

## 6. Yêu cầu giao diện người dùng (UI/UX Requirements)

### 6.1. Màn hình danh sách phòng họp

Các thành phần:

- Danh sách phòng họp gần đây.
- Nút tạo phòng họp.
- Nút tham gia bằng mã.
- Danh sách cuộc họp sắp diễn ra.
- Trạng thái phòng: Đang diễn ra, Đã kết thúc, Đã lên lịch.
- Tìm kiếm và lọc phòng họp.

### 6.2. Màn hình tạo phòng họp

Các trường dữ liệu:

| Trường              | Kiểu dữ liệu  | Bắt buộc |
| ------------------- | ------------- | -------- |
| Tên phòng           | Text          | ✓        |
| Mô tả               | Textarea      |          |
| Loại phòng          | Dropdown      | ✓        |
| Mật khẩu            | Password      |          |
| Quyền riêng tư      | Dropdown      | ✓        |
| Số người tối đa     | Number        | ✓        |
| Ngày họp            | Date          |          |
| Giờ bắt đầu         | Time          |          |
| Thời lượng          | Number        |          |
| Danh sách người mời | User selector |          |

### 6.3. Màn hình phòng họp 3D

[Facebook lancia Horizon Workrooms, per la collaborazione da remoto in realtà virtuale  | Hardware Upgrade](https://images.openai.com/static-rsc-4/BHnYWiyN65aOD0tKS6UQfxpVejmHKW33IvlgWVCDc4foaXqphJkk84zueW8R92LHeKx57_Uu4AKHQe6BzwGsCGEKw9i6ZJDG4redjT3YzHxIb9q_AS-7YqSPdOD2VSyJi2zGPJYq_ZSRPsaTtJ0YI6Akw-AhJZs236tXXPrE8Ho?purpose=inline)

[edge9.hwupgrade.it](https://edge9.hwupgrade.it/news/innovazione/facebook-lancia-horizon-workrooms-per-la-collaborazione-da-remoto-in-realta-virtuale_100031.html?utm_source=chatgpt.com)

Các khu vực:

1. Main View: Không gian 3D và Avatar.
2. Top Bar: Tên phòng, mã phòng, thời gian.
3. Participant Panel: Danh sách người tham gia.
4. Chat Panel: Trao đổi tin nhắn.
5. Presentation Panel: Màn hình trình chiếu.
6. Bottom Toolbar: Micro, Camera, Chat, Share Screen.
7. Meeting Control: Điều hành cuộc họp.
8. Notification: Thông báo sự kiện.

### 6.4. Màn hình biên bản

Thông tin hiển thị:

- Tên cuộc họp.
- Thời gian và địa điểm (phòng ảo).
- Chủ trì.
- Thành phần tham dự.
- Nội dung cuộc họp.
- Ý kiến thảo luận.
- Kết luận.
- Danh sách nhiệm vụ.
- Người thực hiện.
- Thời hạn hoàn thành.
- Trạng thái xác nhận.

## 7. Yêu cầu dữ liệu (Data Requirements)

Các nhóm dữ liệu chính:

| STT | Entity              | Mô tả                         |
| --- | ------------------- | ----------------------------- |
| 1   | MeetingRoom         | Thông tin phòng họp           |
| 2   | MeetingSession      | Phiên họp                     |
| 3   | MeetingParticipant  | Thành viên tham gia           |
| 4   | MeetingRole         | Vai trò thành viên            |
| 5   | UserAvatar          | Thông tin Avatar              |
| 6   | AvatarState         | Trạng thái Avatar             |
| 7   | RoomObject          | Vật thể trong phòng           |
| 8   | RoomConfiguration   | Cấu hình không gian           |
| 9   | ChatMessage         | Tin nhắn                      |
| 10  | MeetingDocument     | Tài liệu cuộc họp             |
| 11  | PresentationSession | Phiên trình chiếu             |
| 12  | Whiteboard          | Bảng trắng                    |
| 13  | WhiteboardElement   | Thành phần bảng trắng         |
| 14  | MeetingPoll         | Cuộc khảo sát                 |
| 15  | PollResponse        | Câu trả lời biểu quyết        |
| 16  | MeetingRecording    | Bản ghi cuộc họp              |
| 17  | AttendanceLog       | Nhật ký điểm danh             |
| 18  | MeetingMinutes      | Biên bản                      |
| 19  | MeetingActionItem   | Công việc sau họp             |
| 20  | MeetingSchedule     | Lịch họp                      |
| 21  | MeetingNotification | Thông báo                     |
| 22  | BreakoutRoom        | Phòng họp nhóm                |
| 23  | MeetingTranscript   | Nội dung chuyển đổi giọng nói |
| 24  | MeetingAuditLog     | Nhật ký hoạt động             |

### 7.1. Quan hệ dữ liệu cơ bản

\#chatgpt-mermaid-\_r_so\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_so\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_so\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_so\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_so\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_so\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_so\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_so\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_so\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_so\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_so\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_so\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_so\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_so\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_so\_ p{margin:0;}#chatgpt-mermaid-\_r_so\_ .entityBox{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_so\_ .relationshipLabelBox{fill:rgb(243, 243, 243);opacity:0.7;background-color:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_so\_ .relationshipLabelBox rect{opacity:0.5;}#chatgpt-mermaid-\_r_so\_ .labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_so\_ .edgeLabel{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_so\_ .edgeLabel .label rect{fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_so\_ .edgeLabel .label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_so\_ .edgeLabel .label{fill:rgb(83, 154, 248);font-size:14px;}#chatgpt-mermaid-\_r_so\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_so\_ .edge-pattern-dashed{stroke-dasharray:8,8;}#chatgpt-mermaid-\_r_so\_ .node rect,#chatgpt-mermaid-\_r_so\_ .node circle,#chatgpt-mermaid-\_r_so\_ .node ellipse,#chatgpt-mermaid-\_r_so\_ .node polygon{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_so\_ .relationshipLine{stroke:rgb(143, 143, 143);stroke-width:1px;fill:none;}#chatgpt-mermaid-\_r_so\_ .marker{fill:none!important;stroke:rgb(143, 143, 143)!important;stroke-width:1;}#chatgpt-mermaid-\_r_so\_ [data-look=neo].labelBkg{background-color:rgba(243, 243, 243, 0.5);}#chatgpt-mermaid-\_r_so\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_so\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_so\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_so\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_so\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_so\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_so\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_so\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_so\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}MEETING_ROOMMEETING_SESSIONMEETING_PARTICIPANTCHAT_MESSAGEMEETING_DOCUMENTMEETING_RECORDINGATTENDANCE_LOGMEETING_MINUTESACTION_ITEMMEETING_POLLPOLL_RESPONSEWHITEBOARDBREAKOUT_ROOMUSER_AVATARhasincludescontainsusesgeneratesrecordsproducescontainshasreceivescontainscontainsrepresents

## 8. Yêu cầu phi chức năng (Non-functional Requirements)

| ID      | Nhóm            | Yêu cầu                                           |
| ------- | --------------- | ------------------------------------------------- |
| NFR-001 | Performance     | Thời gian tải giao diện phòng họp cần được tối ưu |
| NFR-002 | Performance     | Đồng bộ vị trí Avatar theo thời gian thực         |
| NFR-003 | Scalability     | Hỗ trợ mở rộng số lượng phòng họp đồng thời       |
| NFR-004 | Availability    | Hỗ trợ cơ chế reconnect khi mất kết nối           |
| NFR-005 | Security        | Xác thực người dùng và phân quyền                 |
| NFR-006 | Security        | Mã hóa dữ liệu truyền tải                         |
| NFR-007 | Privacy         | Kiểm soát quyền truy cập bản ghi                  |
| NFR-008 | Compatibility   | Hỗ trợ các trình duyệt PC phổ biến                |
| NFR-009 | Usability       | Giao diện trực quan, dễ sử dụng                   |
| NFR-010 | Reliability     | Hạn chế mất dữ liệu khi xảy ra sự cố              |
| NFR-011 | Logging         | Lưu nhật ký các hoạt động quan trọng              |
| NFR-012 | Maintainability | Thiết kế module độc lập, dễ mở rộng               |
| NFR-013 | 3D Performance  | Tối ưu mô hình 3D, texture và animation           |
| NFR-014 | Audio/Video     | Hỗ trợ điều chỉnh chất lượng theo mạng            |
| NFR-015 | Data Retention  | Có chính sách lưu trữ và xóa dữ liệu              |

Các chỉ tiêu định lượng đề xuất để kiểm thử:

| Chỉ tiêu                            | Mục tiêu ban đầu                       |
| ----------------------------------- | -------------------------------------- |
| Thời gian tải phòng họp             | ≤ 10 giây                              |
| Độ trễ đồng bộ Avatar               | ≤ 150 ms trong điều kiện mạng mục tiêu |
| Độ trễ âm thanh                     | ≤ 300 ms trong điều kiện mạng mục tiêu |
| Thời gian phản hồi API thông thường | P95 ≤ 500 ms                           |
| Tỷ lệ sẵn sàng hệ thống             | ≥ 99,5%                                |
| Số người/phòng ở MVP                | 20 người                               |
| Số phòng đồng thời                  | Thiết lập theo tải dự kiến             |

Các chỉ tiêu trên là mục tiêu thiết kế ban đầu, cần được xác nhận bằng kiểm thử hiệu năng và sizing hạ tầng trước khi nghiệm thu.

## 9. Yêu cầu tích hợp hệ thống (Integration Requirements)

| STT | Hệ thống/Công nghệ     | Mục đích                              |
| --- | ---------------------- | ------------------------------------- |
| 1   | Authentication Service | Đăng nhập và xác thực                 |
| 2   | User Management        | Quản lý tài khoản                     |
| 3   | WebSocket              | Đồng bộ trạng thái thời gian thực     |
| 4   | WebRTC                 | Truyền tải âm thanh và video          |
| 5   | SFU Server             | Phân phối luồng media nhiều người     |
| 6   | 3D Engine              | Render môi trường 3D                  |
| 7   | Object Storage         | Lưu tài liệu, bản ghi                 |
| 8   | Notification Service   | Gửi thông báo                         |
| 9   | Calendar Service       | Đồng bộ lịch                          |
| 10  | AI Service             | Xử lý transcript và tổng hợp nội dung |

## 10. Các trạng thái hệ thống

### 10.1. Trạng thái phòng họp

| Trạng thái | Mô tả               |
| ---------- | ------------------- |
| Draft      | Phòng đang được tạo |
| Scheduled  | Đã lên lịch         |
| Waiting    | Đang chờ bắt đầu    |
| Active     | Đang diễn ra        |
| Locked     | Đang khóa           |
| Ended      | Đã kết thúc         |
| Cancelled  | Đã hủy              |

### 10.2. Trạng thái người tham gia

| Trạng thái | Mô tả              |
| ---------- | ------------------ |
| Invited    | Đã được mời        |
| Waiting    | Đang chờ duyệt     |
| Online     | Đang trong phòng   |
| Offline    | Mất kết nối        |
| Muted      | Đang tắt micro     |
| Speaking   | Đang phát biểu     |
| Presenting | Đang trình bày     |
| Left       | Đã rời phòng       |
| Removed    | Bị loại khỏi phòng |

## 11. Tiêu chí nghiệm thu (Acceptance Criteria)

| ID     | Tiêu chí nghiệm thu | Kết quả mong đợi                            |
| ------ | ------------------- | ------------------------------------------- |
| AC-001 | Tạo phòng họp       | Tạo thành công và sinh mã phòng             |
| AC-002 | Tham gia phòng      | Người dùng có quyền truy cập vào được phòng |
| AC-003 | Avatar              | Hiển thị và điều khiển được Avatar          |
| AC-004 | Multiplayer         | Nhiều người nhìn thấy hành động của nhau    |
| AC-005 | Voice Chat          | Giao tiếp được bằng âm thanh                |
| AC-006 | Camera              | Bật/tắt và xem được video                   |
| AC-007 | Chat                | Tin nhắn được đồng bộ                       |
| AC-008 | Trình chiếu         | Người tham gia xem được tài liệu            |
| AC-009 | Whiteboard          | Nhiều người cùng tương tác                  |
| AC-010 | Phân quyền          | Chức năng tuân thủ vai trò                  |
| AC-011 | Điểm danh           | Lưu thời gian vào và ra                     |
| AC-012 | Ghi hình            | Lưu và phát lại bản ghi                     |
| AC-013 | Biên bản            | Tạo và xuất biên bản                        |
| AC-014 | Biểu quyết          | Ghi nhận và tổng hợp kết quả                |
| AC-015 | Reconnect           | Có thể kết nối lại sau gián đoạn            |

## 12. Phân kỳ triển khai

| Phase   | Hạng mục                                                               | Mức độ   |
| ------- | ---------------------------------------------------------------------- | -------- |
| Phase 1 | Quản lý phòng, không gian 3D, Avatar, di chuyển, ngồi ghế, multiplayer | MVP      |
| Phase 2 | Voice, Text Chat, phân quyền, quản lý thành viên                       | High     |
| Phase 3 | Video, chia sẻ màn hình, trình chiếu, Whiteboard                       | High     |
| Phase 4 | Điểm danh, biểu quyết, biên bản, Action Items                          | Medium   |
| Phase 5 | Ghi hình, AI, dịch thuật, Breakout Rooms                               | Advanced |

## 13. Các vấn đề cần làm rõ (Open Issues)

| STT | Nội dung                             | Đề xuất mặc định    |
| --- | ------------------------------------ | ------------------- |
| 1   | Số người tối đa/phòng                | 20 người ở MVP      |
| 2   | Có bắt buộc sử dụng camera?          | Không               |
| 3   | Có hỗ trợ khách ngoài hệ thống?      | Có, qua link mời    |
| 4   | Có cho phép ghi hình?                | Có, theo quyền Host |
| 5   | Có hỗ trợ phòng họp riêng tư?        | Có                  |
| 6   | Có hỗ trợ âm thanh theo khoảng cách? | Có                  |
| 7   | Có cần lưu lịch sử họp?              | Có                  |
| 8   | Có cần tích hợp AI?                  | Để Phase 5          |
| 9   | Có hỗ trợ thiết bị di động?          | Chưa thuộc MVP      |

## 14. Giả định và ràng buộc triển khai

1. Người dùng phải có tài khoản hoặc được cấp quyền truy cập phòng họp.
2. Mỗi phòng họp có một Host chịu trách nhiệm điều hành.
3. Không gian 3D và hệ thống giao tiếp được thiết kế độc lập để dễ mở rộng.
4. Các chức năng Video, Voice, Screen Sharing phụ thuộc quyền truy cập thiết bị và trình duyệt.
5. Ghi hình, ghi âm và AI phải tuân thủ chính sách bảo mật dữ liệu.
6. Số lượng người tham gia đồng thời cần được xác định thông qua kiểm thử tải.
7. Hệ thống phải hỗ trợ mở rộng thêm các loại phòng họp và tính năng cộng tác trong tương lai.

## 15. Kết quả đầu ra yêu cầu

| STT | Deliverable                  | Đơn vị thực hiện |
| --- | ---------------------------- | ---------------- |
| 1   | UI/UX Design – Phòng họp ảo  | UI/UX            |
| 2   | 3D Room Environment          | 3D Developer     |
| 3   | Avatar & Animation System    | 3D Developer     |
| 4   | Meeting Room Management API  | Backend          |
| 5   | Real-time Multiplayer System | Backend          |
| 6   | Voice/Video Communication    | Backend          |
| 7   | Meeting Room Interface       | Frontend         |
| 8   | Whiteboard & Presentation    | Frontend/Backend |
| 9   | Meeting Management           | Frontend/Backend |
| 10  | Database Design              | Backend          |
| 11  | Integration Test             | QA               |
| 12  | Performance & Load Test      | QA/DevOps        |

## 16. Kết luận

Module Phòng họp ảo được định hướng là một không gian cộng tác 3D Multiplayer, mô phỏng đầy đủ hoạt động của một phòng họp thực tế.

Các nguyên tắc thiết kế chính:

- Realistic Interaction: Tương tác như phòng họp ngoài đời thực.
- Real-time Collaboration: Nhiều người cùng tương tác đồng thời.
- Immersive 3D Environment: Không gian 3D có chiều sâu và tính nhập vai.
- Meeting Management: Quản lý và điều hành cuộc họp chuyên nghiệp.
- Extensibility: Có khả năng mở rộng thành hệ thống Virtual Office.
