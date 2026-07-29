// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/modules/requests/request.routes.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
export { checkDuplicateCaseInfo } from "./creation.duplicates.controller.js";
export { createRequest } from "./creation.request.controller.js";
export { cloneRequestToDraft } from "./creation.draft.controller.js";
export { createRequestsFromDraft } from "./creation.from-draft.controller.js";
export { createRequestsBulk } from "./creation.request.controller.js";
