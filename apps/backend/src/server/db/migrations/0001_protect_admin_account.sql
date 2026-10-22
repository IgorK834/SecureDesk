-- Defense in depth for the permanent ADMIN account (login_normalized = 'admin', see
-- normalizeLogin). The service layer rejects these changes first with a proper error (Task
-- 4.3); these triggers make the database refuse them as well, so a bug or a direct SQL session
-- cannot delete, rename, re-role, block or soft-delete ADMIN. Everything else on the row
-- (password hash, must_change_password, names, timestamps) stays writable.
CREATE TRIGGER `users_admin_no_delete`
BEFORE DELETE ON `users`
WHEN OLD.`login_normalized` = 'admin'
BEGIN
	SELECT RAISE(ABORT, 'The ADMIN account cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `users_admin_protected_fields`
BEFORE UPDATE ON `users`
WHEN OLD.`login_normalized` = 'admin' AND (
	NEW.`login` IS NOT OLD.`login`
	OR NEW.`login_normalized` IS NOT OLD.`login_normalized`
	OR NEW.`role_id` IS NOT OLD.`role_id`
	OR NEW.`is_blocked` <> 0
	OR NEW.`deleted_at` IS NOT NULL
)
BEGIN
	SELECT RAISE(ABORT, 'The ADMIN account cannot be renamed, re-roled, blocked or deleted');
END;
