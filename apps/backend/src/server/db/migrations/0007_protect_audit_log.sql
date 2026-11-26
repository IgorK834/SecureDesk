CREATE TRIGGER `audit_log_no_update`
BEFORE UPDATE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete`
BEFORE DELETE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'audit_log is append-only');
END;
--> statement-breakpoint
-- REPLACE can implicitly delete a conflicting row without firing DELETE triggers.
CREATE TRIGGER `audit_log_no_replace`
BEFORE INSERT ON `audit_log`
WHEN EXISTS (SELECT 1 FROM `audit_log` WHERE `seq` = NEW.`seq` OR `id` = NEW.`id`)
BEGIN
	SELECT RAISE(ABORT, 'audit_log is append-only');
END;
