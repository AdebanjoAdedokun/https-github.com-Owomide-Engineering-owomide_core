-- Rollback: 0002_notifications
-- Service: notify
DROP FUNCTION IF EXISTS notify.mark_email_failed(uuid, text, integer);
DROP FUNCTION IF EXISTS notify.mark_email_sent(uuid, text);
DROP FUNCTION IF EXISTS notify.claim_email_deliveries(integer, integer);
DROP TABLE IF EXISTS notify.proposal_participant;
DROP TABLE IF EXISTS notify.email_delivery;
DROP TABLE IF EXISTS notify.notification_preference;
DROP TRIGGER IF EXISTS notification_guard_update ON notify.notification;
DROP TABLE IF EXISTS notify.notification;
DROP FUNCTION IF EXISTS notify.guard_notification_update();
DROP FUNCTION IF EXISTS notify.current_org_id();
