// Pay-link sentence for the garage booking panel. Time is America/Chicago.
(function (root) {
  var CHICAGO = 'America/Chicago';

  function chicagoPayLinkTime(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (!value || Number.isNaN(date.getTime())) return '';
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);
    function get(type) {
      var part = parts.find(function (item) { return item.type === type; });
      return part ? part.value : '';
    }
    var month = get('month');
    var day = get('day');
    var hour = get('hour');
    var minute = get('minute');
    var ap = get('dayPeriod');
    if (!month || !day || !hour || !minute || !ap) return '';
    return month + ' ' + day + ', ' + hour + ':' + minute + ' ' + ap;
  }

  function payLinkSentNote(input) {
    var when = chicagoPayLinkTime(input && input.sentAt);
    if (!when) return '';
    var email = String((input && input.email) || '').trim();
    var amount = input && input.amount != null && input.amount !== '' ? Number(input.amount) : NaN;
    var status = String((input && input.status) || '').toLowerCase();
    var paid = status === 'succeeded' || (input && input.paid === true);
    var note = 'Pay link sent ' + when;
    if (email) note += ' to ' + email;
    if (Number.isFinite(amount) && amount > 0) note += ' ($' + amount.toFixed(2) + ')';
    if (paid) note += ' · Paid';
    else if (status === 'failed') note += ' · Failed';
    else if (status === 'authentication_required') note += ' · Needs approval';
    return note;
  }

  // prior: { known: boolean, id: string }. A row counts as new when the id
  // changed, or when the lookup before send failed and created_at is after startedAt.
  function isNewPayLinkRow(prior, row, startedAt) {
    if (!row || !row.id) return false;
    var known = !!(prior && prior.known);
    if (known) return String(row.id) !== String((prior && prior.id) || '');
    var created = Date.parse(row.created_at);
    return Number.isFinite(created) && Number.isFinite(startedAt) && created >= startedAt - 15000;
  }

  function dayBeforeSentNote(sentAt) {
    var when = chicagoPayLinkTime(sentAt);
    if (!when) return '';
    return 'Day-before email sent ' + when;
  }

  var api = {
    chicagoPayLinkTime: chicagoPayLinkTime,
    payLinkSentNote: payLinkSentNote,
    isNewPayLinkRow: isNewPayLinkRow,
    dayBeforeSentNote: dayBeforeSentNote,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.chicagoPayLinkTime = chicagoPayLinkTime;
  root.payLinkSentNote = payLinkSentNote;
  root.isNewPayLinkRow = isNewPayLinkRow;
  root.dayBeforeSentNote = dayBeforeSentNote;
})(typeof globalThis !== 'undefined' ? globalThis : this);
