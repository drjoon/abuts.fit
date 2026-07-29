// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
const asyncHandler = (requestHandler) => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };
