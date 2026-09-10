CREATE TABLE plan_change_requests (
  request_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  target_plan TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_plan_change_requests_subscription_id ON plan_change_requests(subscription_id);
