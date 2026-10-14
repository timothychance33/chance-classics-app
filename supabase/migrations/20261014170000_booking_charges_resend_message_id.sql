-- Resend id for the customer pay-link email, so a delivery can be matched later.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when Tim approves.
-- It is not applied by this pull request.
-- Also apply 20261012203000_saved_card_and_charges.sql first.

alter table rental.booking_charges
  add column if not exists resend_message_id text;

comment on column rental.booking_charges.resend_message_id is
  'Resend email id for the customer pay-link message. Null until that email is accepted.';
