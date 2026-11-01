/**
 * The form a client pastes on a landing page. The script adds what Meta needs to
 * match the lead: UTM values, click IDs and an event ID shared with the Pixel.
 * Without JavaScript it still posts, and the endpoint shows a plain thank-you.
 */
export function landingSnippet(appUrl: string, intakeKey: string) {
  return `<form id="qualent-form" method="post" action="${appUrl}/api/intake/${intakeKey}">
  <input name="name" placeholder="Name" autocomplete="name">
  <input name="phone" type="tel" placeholder="Phone" autocomplete="tel" required>
  <input name="website" hidden tabindex="-1" autocomplete="off">
  <input type="hidden" name="consent_text" value="I agree to be contacted about my enquiry.">
  <label><input type="checkbox" required> I agree to be contacted about my enquiry.</label>
  <button>Send</button>
</form>
<script>
(function () {
  var form = document.getElementById("qualent-form");
  var query = new URLSearchParams(location.search);
  var cookie = function (name) {
    var match = document.cookie.match("(?:^|; )" + name + "=([^;]*)");
    return match ? decodeURIComponent(match[1]) : "";
  };
  var eventId = crypto.randomUUID();
  var clickId = query.get("fbclid") || "";
  var fields = {
    event_id: eventId,
    page_url: location.href,
    fbclid: clickId,
    fbp: cookie("_fbp"),
    fbc: cookie("_fbc") || (clickId ? "fb.1." + Date.now() + "." + clickId : "")
  };
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (name) {
    fields[name] = query.get(name) || "";
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(form);
    Object.keys(fields).forEach(function (name) { if (fields[name]) data.set(name, fields[name]); });
    // Same ID on both sides, so Meta counts this lead once.
    if (window.fbq) window.fbq("track", "Lead", {}, { eventID: eventId });
    fetch(form.action, { method: "POST", body: data }).then(function (response) {
      if (!response.ok) throw new Error();
      form.textContent = "Thanks, we got your details.";
    }).catch(function () {
      alert("That didn't send. Check your details and try again.");
    });
  });
})();
</script>`;
}
