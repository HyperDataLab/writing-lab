# Hướng dẫn AI khởi chạy và truy cập Writing Lab

> Tài liệu này dành cho AI agent tiếp nhận repo Writing Lab. Hãy dùng code và file cấu hình trong repo làm nguồn sự thật; không tự đoán URL, client ID, project ID hay thông tin xác thực.

## Quy tắc thao tác cho AI

1. Đọc `package.json`, `.env.example`, `worker/package.json` và cấu hình Wrangler để xác nhận lệnh/port hiện tại trước khi chạy.
2. Chỉ kiểm tra file `.env.local` và `worker/.dev.vars` có tồn tại hay không; không in nội dung hoặc đưa secret vào log, câu trả lời hay tài liệu.
3. Không ghi đè cấu hình local đang có. Nếu thiếu SSO client ID hoặc Firestore service account, báo chính xác biến/file còn thiếu và để chủ dự án cấu hình an toàn; không tự tạo giá trị giả.
4. Chạy frontend và Worker local, xác nhận health check. Việc đăng nhập và chọn project vẫn cần người dùng mở công cụ từ ResearchHub; không giả lập token hay bỏ qua kiểm tra quyền.
5. Không gọi lệnh deploy khi mục tiêu chỉ là chạy local.

## 1. Writing Lab gồm những gì

- Frontend: Next.js, mặc định `http://localhost:3000`.
- Backend: Cloudflare Worker, mặc định `http://localhost:8787`.
- Kho dữ liệu: Cloud Firestore. Worker dùng Firebase service account; trình duyệt không truy cập Firestore trực tiếp.
- Đăng nhập và project: nhận phiên cùng `projectId` từ ResearchHub qua SSO handoff. Worker xác minh tài khoản và quyền project trước khi cho đọc/ghi.
- Cloudflare R2 hiện chưa dùng cho dữ liệu writing; nội dung và lịch sử có cấu trúc được lưu trong Firestore.

Các trang chính: `/` (Trang chủ), `/evaluate`, `/revise`, `/generate`, `/history`, `/calibration`, `/report`, `/compare` và `/settings`.

## 2. Cài đặt lần đầu

Yêu cầu Node.js `>=20.9`. Mở PowerShell ở thư mục gốc repo:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
Copy-Item worker/.dev.vars.example worker/.dev.vars
```

Điền `.env.local`:

| Biến | Dùng để làm gì |
| --- | --- |
| `NEXT_PUBLIC_HYPERDATALAB_SSO_BASE_URL` | SSO provider; mặc định theo `.env.example`. |
| `NEXT_PUBLIC_HYPERDATALAB_SSO_CLIENT_ID` | Client ID public đã đăng ký cho Writing Lab. Giá trị mẫu `register-writing-lab-client` không phải client ID thật. |
| `NEXT_PUBLIC_HYPERDATALAB_SSO_CALLBACK_URL` | Callback phải trùng chính xác cấu hình ở SSO; local mặc định `http://localhost:3000/auth/callback`. |
| `NEXT_PUBLIC_RESEARCH_HUB_URL` | URL ResearchHub dùng cho nút quay lại/mở project. |
| `NEXT_PUBLIC_RESEARCH_HUB_ORIGINS` | Danh sách origin của cửa sổ ResearchHub được tin cậy cho `postMessage` handoff, phân tách bằng dấu phẩy. Phải gồm đúng origin ResearchHub đang mở Writing Lab, đủ scheme và port, ví dụ `https://researchhub.hyperdatalab.org` hoặc `http://localhost:3001`. |
| `NEXT_PUBLIC_WORKER_API_URL` | URL Worker API; local mặc định `http://localhost:8787`. |

Không đặt service-account key, refresh token hay API key riêng tư trong biến `NEXT_PUBLIC_*`. Client ID SSO là public; service-account JSON thì không.

Điền `worker/.dev.vars` với `FIREBASE_SERVICE_ACCOUNT_JSON` là JSON một dòng của service account có quyền đọc/ghi Firestore. Không đưa private key vào terminal output, commit, tài liệu hoặc chat. File `.dev.vars` là cấu hình local riêng, không chia sẻ. Kiểm tra `.gitignore` trước khi thêm file bí mật vào repo.

Worker local đọc `worker/wrangler.local.toml`; file này đặt CORS cho `http://localhost:3000` và không yêu cầu đăng nhập Cloudflare để chạy. Nếu frontend chạy port khác, cập nhật `ALLOWED_ORIGINS` trong `worker/wrangler.local.toml` bằng đúng origin frontend. `NEXT_PUBLIC_RESEARCH_HUB_ORIGINS` và Worker `ALLOWED_ORIGINS` phục vụ hai luồng khác nhau: một biến xác minh origin của cửa sổ ResearchHub gửi handoff, biến còn lại cho phép origin frontend gọi Worker.

## 3. Khởi chạy local

Chạy hai tiến trình ở hai terminal, từ thư mục repo.

Terminal 1 — frontend:

```powershell
npm.cmd run dev -- --port 3000
```

Terminal 2 — Worker:

```powershell
npm.cmd run dev:worker
```

Xác nhận Worker đã chạy:

```powershell
Invoke-RestMethod http://localhost:8787/api/health
```

Kết quả mong đợi có `service: writing-lab-api` và `status: ok`. Endpoint health chỉ xác nhận Worker đang chạy; nó chưa xác nhận SSO, quyền project hay Firestore.

Nếu port `3000` đang bận, dừng tiến trình cũ hoặc chọn một port cố định khác; sau đó đồng bộ port đó ở callback SSO, `NEXT_PUBLIC_HYPERDATALAB_SSO_CALLBACK_URL`, `NEXT_PUBLIC_RESEARCH_HUB_ORIGINS`, Worker `ALLOWED_ORIGINS` và URL Writing Lab được ResearchHub mở. Không để Next.js tự chuyển sang port khác mà quên cập nhật các cấu hình này.

## 4. Nối bản local vào ResearchHub

Để nút Writing Lab trong ResearchHub mở đúng bản đang chạy local, người có quyền quản trị ResearchHub cần vào phần **admin tool settings** và đặt URL của tool **Writing Lab** thành `http://localhost:3000`. Khi dùng bản đã deploy, đặt URL thành domain frontend đã deploy thay vì localhost. Đây là URL frontend; không điền URL Worker vào mục này.

Handoff yêu cầu Writing Lab được mở từ một cửa sổ con do ResearchHub tạo và giữ `window.opener`. Nếu ResearchHub đang chuyển trang trong cùng tab hoặc mở link với `noopener`, Writing Lab không thể nhận phiên; cần dùng nút mở tool hỗ trợ handoff. Không tự tạo URL có `rh_handoff`.

Trong `.env.local`, `NEXT_PUBLIC_RESEARCH_HUB_URL` phải trỏ về ResearchHub đang dùng. `NEXT_PUBLIC_RESEARCH_HUB_ORIGINS` phải chứa origin của chính cửa sổ ResearchHub đó: khi ResearchHub production mở frontend local, thường là `https://researchhub.hyperdatalab.org`; nếu ResearchHub cũng chạy local ở port `3001`, dùng `http://localhost:3001`. Giữ `worker/wrangler.local.toml` với `ALLOWED_ORIGINS = "http://localhost:3000"` khi frontend đang ở port `3000`.

## 5. Mở Writing Lab bằng tài khoản/project ResearchHub

1. Mở ResearchHub theo `NEXT_PUBLIC_RESEARCH_HUB_URL` trong `.env.local` (mặc định `https://researchhub.hyperdatalab.org`) và đăng nhập bằng tài khoản HyperDataLab đã xác minh email `@hyperdatalab.org`. Nếu AI đang điều khiển trình duyệt, để chủ tài khoản tự đăng nhập và chọn project khi được yêu cầu; không hỏi hoặc đọc mật khẩu, OTP hay token.
2. Chọn project mà tài khoản có quyền truy cập, rồi vào workspace project đó.
3. Bấm công cụ **Writing Lab** trong workspace. Với môi trường local, nút này phải mở `http://localhost:3000` theo mục cấu hình ở trên. ResearchHub sẽ gắn `projectId` và chuyển phiên qua handoff; không tự ghép URL hoặc chép giá trị `rh_handoff`.
4. Giữ cửa sổ ResearchHub đang mở. Writing Lab nhận token qua `postMessage`, gọi SSO `/oauth/userinfo` để xác minh, rồi gọi Worker `GET /v1/me` để xác nhận project thuộc tài khoản.
5. Khi màn hình Writing Lab tải xong, kiểm tra header có tài khoản và project đúng; người dùng có thể mở các chức năng từ sidebar. Tải lại trang trong cùng tab giữ phiên/project trong `sessionStorage`; nếu phiên hết hạn hoặc project không còn, mở lại Writing Lab từ workspace ResearchHub.

Mở trực tiếp `http://localhost:3000` mà không có project chỉ hiện màn hình hướng dẫn mở từ ResearchHub. Có thể dùng nút đăng nhập SSO trong màn hình lỗi để đăng nhập client, nhưng Worker vẫn bắt buộc xác minh project; không bỏ qua hoặc sửa `ProjectAccessGate` để vào thẳng workspace.

## 6. Cấu hình AI (chỉ khi cần Evaluate/Revise/Generate)

Trong Writing Lab, mở **Cài đặt**, điền Base URL, model và API key 9router. Mặc định trong code là `https://9router.dcloud.io.vn/v1` và `cx/gpt-6-luna`; Worker chỉ chuyển tiếp tới hostname nằm trong `LLM_ALLOWED_HOSTS`. Cấu hình được giữ trong `localStorage` của trình duyệt hiện tại. Ứng dụng sẽ hỏi đồng ý trước khi gửi nội dung tới model; không tự xác nhận thay người dùng.

Các trang lịch sử, báo cáo và hiệu chuẩn dùng dữ liệu Firestore; AI không cần thiết cho thao tác đọc các bản ghi đã có.

## 7. Cách dữ liệu và quyền được bảo vệ

- Mỗi request Worker mang `Authorization: Bearer <SSO token>` và `X-Project-Id`.
- Worker xác minh token với SSO, kiểm tra project qua ResearchHub rồi mới đọc/ghi Firestore.
- Bản ghi được phân vùng theo user và project tại `users/{uid}/projects/{projectId}/writingRecords/{recordId}`.
- Firestore Rules chặn trình duyệt truy cập trực tiếp; service-account key chỉ nằm ở Worker.
- Không thêm credential, token, nội dung người dùng hoặc service-account JSON vào log, commit, screenshot hay tài liệu.

## 8. Chẩn đoán nhanh

| Triệu chứng | Kiểm tra |
| --- | --- |
| Trang yêu cầu mở ResearchHub | Đảm bảo URL có `projectId` hợp lệ và mở Writing Lab từ workspace của project. |
| Không nhận được phiên / hết thời gian handoff | Để ResearchHub mở; xác nhận tool mở cửa sổ con có `window.opener`; kiểm tra `NEXT_PUBLIC_RESEARCH_HUB_ORIGINS` trùng origin (kể cả port) của cửa sổ ResearchHub; thử mở lại từ project. |
| Báo không kết nối được Worker | Chạy `npm.cmd run dev:worker`; kiểm tra `NEXT_PUBLIC_WORKER_API_URL`, rồi gọi `/api/health`. |
| Browser báo CORS | Đặt Worker `ALLOWED_ORIGINS` trùng origin frontend chính xác, gồm scheme và port; khởi động lại Worker. |
| `/v1/me` trả 401/403 | Kiểm tra phiên SSO còn hạn, tài khoản đúng tổ chức, `projectId` hiện tại và quyền project. Không sửa quyền kiểm tra ở client để lách lỗi. |
| Firestore trả 503 hoặc lỗi cấu hình | Kiểm tra `worker/.dev.vars`, JSON service account, `project_id`, `client_email`, `private_key`, Firestore đã bật và service account có quyền. Không in JSON/key ra log để chẩn đoán. |
| AI báo thiếu API key hoặc request bị từ chối | Cấu hình key trong **Cài đặt**; kiểm tra Base URL và hostname có nằm trong `LLM_ALLOWED_HOSTS`; chỉ đồng ý gửi nội dung nếu người dùng cho phép. |

## 9. Kiểm tra mã nguồn trước khi bàn giao

Đọc scripts hiện có trong `package.json`, sau đó chạy kiểm tra phù hợp với phần đã sửa. Các lệnh hiện có:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:worker
npm.cmd run build
```

Ghi lại lệnh nào đã chạy và kết quả thật. Không tuyên bố Worker đã deploy chỉ vì local Worker chạy được.
