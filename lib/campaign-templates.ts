// Marketing email templates for the batch sender. Each is a complete HTML
// email with two placeholders filled per recipient:
//   {{first_name}}      - recipient's first name, or "Me" if unknown
//   {{unsubscribe_url}} - signed one-click unsubscribe link
// To add a new campaign, add an entry here.

export type CampaignTemplate = {
  key: string
  name: string
  defaultSubject: string
  // Which audience this email is written for, so the admin can warn if
  // it's sent to the wrong group (e.g. a 40%-off email to past customers).
  intendedFor: 'not_subscribed' | 'past_customers' | 'subscribers' | 'cancelled_40' | 'cancelled_20' | 'cancelled_pre_nov_40' | 'cancelled_pre_nov_20' | 'any'
  // Used for {{first_name}} when we don't know someone's name.
  nameFallback?: string
  html: string
}

// Plain, personal-looking email (like a message from Bukr) - tends to land
// in the main inbox rather than Promotions.
const plain = (paragraphs: string[]) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:480px;margin:0 auto;padding:24px 16px;">
${paragraphs.map((p) => `  <p style="margin:0 0 16px;">${p}</p>`).join('\n')}
  <p style="margin:24px 0 0;font-size:12px;color:#888888;">STOP: <a href="{{unsubscribe_url}}" style="color:#888888;">unsubscribe</a></p>
</div>
</body></html>`

const CUTOFFS = 'Sunday delivery: order by Thursday 8pm<br/>Wednesday delivery: order by Sunday 8pm'
const ORDER_LINK = 'Order here: <a href="https://prepcuisines.co.uk/menu" style="color:#1a2e1a;font-weight:600;">prepcuisines.co.uk/menu</a>'

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: 'first-box-40',
    name: 'First box - 40% off, then 20% for 5 orders',
    defaultSubject: '{{first_name}}, 40% off your first box',
    intendedFor: 'not_subscribed',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>40% off your first box</title>
<style>
@media only screen and (max-width:520px){
  .pad{padding-left:20px !important;padding-right:20px !important;}
  .h1{font-size:28px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
  .mealimg{width:120px !important;}
  .mealimg img{width:120px !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
<div style="display:none;max-height:0;overflow:hidden;">40% off your first box, then 20% off your next 5 orders when you subscribe.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">

  <tr><td class="pad" style="background:#1a2e1a;padding:30px 30px 34px;text-align:center;">
    <img alt="prepcuisines" src="https://www.prepcuisines.co.uk/logo-email.png" width="400" style="display:block;width:400px;max-width:100%;height:auto;margin:0 auto 26px;border:0;"/>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">YOUR FIRST BOX</p>
    <h1 class="h1" style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.15;color:#f5f0e8;">40% off your first box.</h1>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:34px 36px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333;">
    <p style="margin:0 0 14px;">Hey {{first_name}},</p>
    <p style="margin:0 0 14px;">Chef-made, high protein meals, delivered fresh to your door. Here's your welcome offer:</p>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td class="stack" valign="top" width="50%" style="padding:0 8px 0 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:12px;">
          <tr><td align="center" style="padding:26px 14px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:50px;line-height:1;color:#1a2e1a;">40%</p>
            <p style="margin:6px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#1a2e1a;">off your first box</p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1a2e1a;">applied automatically at checkout</p>
          </td></tr>
        </table>
      </td>
      <td class="stack" valign="top" width="50%" style="padding:0 0 0 8px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:12px;">
          <tr><td align="center" style="padding:26px 14px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:50px;line-height:1;color:#c9a84c;">20%</p>
            <p style="margin:6px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#f5f0e8;">off your next 5 orders</p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#f5f0e8;">when you subscribe</p>
          </td></tr>
        </table>
      </td>
    </tr></table>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:30px 36px 14px;text-align:center;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">THIS WEEK'S FAVOURITES</p>
    <h2 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.2;color:#1a2e1a;">Pick from chef-made meals like these</h2>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Bang Bang Chicken" src="https://www.prepcuisines.co.uk/bang-bang-chicken.jpg" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">525 kcal &middot; 35g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong>&pound;4.80</strong> on your first box</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">528 kcal &middot; 50g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong>&pound;4.80</strong> on your first box</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Lebanese Garlic Herb Chicken Bowl" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/IMG_0466.jpeg" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Lebanese Garlic Herb Chicken Bowl</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">555 kcal &middot; 46g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong>&pound;4.80</strong> on your first box</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">503 kcal &middot; 51g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong>&pound;4.80</strong> on your first box</p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:30px 36px 14px;text-align:center;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">WHAT YOU GET</p>
    <h2 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.2;color:#1a2e1a;">Healthy eating, without the effort</h2>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:12px;">
      <tr><td style="padding:22px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#f5f0e8;">
        <p style="margin:0;padding:10px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; <strong>Chef-made from fresh</strong>, cooked by our chefs in Stoke-on-Trent</p>
        <p style="margin:0;padding:10px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; <strong>High protein</strong>, macros on every single meal</p>
        <p style="margin:0;padding:10px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; <strong>Heat, eat, done</strong>, no cooking, no washing up</p>
        <p style="margin:0;padding:10px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; <strong>You choose the meals</strong>, from a rotating weekly menu</p>
        <p style="margin:0;padding:10px 0 0;"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; <strong>Skip or change any week</strong>, no lock-in</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:30px 36px 14px;text-align:center;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">HOW MUCH YOU'LL SAVE</p>
    <h2 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.2;color:#1a2e1a;">Your first 6 boxes, side by side</h2>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:2px solid #1a2e1a;border-radius:12px;">
      <tr><td style="padding:20px 24px 4px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7a6b;">A box of 6 meals</td></tr>
      <tr><td style="padding:0 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1a2e1a;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:11px 0;border-bottom:1px solid #e8e0d0;">Normal price</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8e0d0;font-weight:400;"><span style="text-decoration:line-through;color:#999999;">&pound;48.00</span></td></tr>
          <tr><td style="padding:11px 0;border-bottom:1px solid #e8e0d0;">Your first box (40% off)</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8e0d0;font-weight:700;">&pound;28.80</td></tr>
          <tr><td style="padding:11px 0;">Orders 2 to 6 (20% off)</td><td align="right" style="padding:11px 0;font-weight:400;">&pound;38.40 each</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="background:#1a2e1a;border-radius:0 0 10px 10px;padding:18px 24px;">
        <p style="margin:0;font-family:Georgia,serif;font-size:28px;line-height:1.1;color:#c9a84c;">Save &pound;67.20</p>
        <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#f5f0e8;">across your first 6 boxes</p>
      </td></tr>
    </table>
    <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#999999;text-align:center;">Based on 6 meals at &pound;8.00 each. Delivery is charged separately and isn't discounted.</p>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:30px 36px 14px;text-align:center;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">YOUR TIME</p>
    <h2 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.2;color:#1a2e1a;">Get your week back</h2>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border:2px solid #1a2e1a;border-radius:12px;">
      <tr><td style="padding:20px 24px 4px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7a6b;">Where your week goes</td></tr>
      <tr><td style="padding:0 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1a2e1a;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:11px 0;border-bottom:1px solid #e8e0d0;">Food shop</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8e0d0;font-weight:700;">1 hr</td></tr>
          <tr><td style="padding:11px 0;border-bottom:1px solid #e8e0d0;">Prep and cooking</td><td align="right" style="padding:11px 0;border-bottom:1px solid #e8e0d0;font-weight:700;">3 hrs</td></tr>
          <tr><td style="padding:11px 0;">Cleaning and washing up</td><td align="right" style="padding:11px 0;font-weight:700;">1 hr</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="background:#c9a84c;border-radius:0 0 10px 10px;padding:18px 24px;">
        <p style="margin:0;font-family:Georgia,serif;font-size:28px;line-height:1.1;color:#1a2e1a;">5 hours back</p>
        <p style="margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#1a2e1a;">every single week</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 40px;text-align:center;font-family:Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#555555;">Chef-made, high protein, from £4.80 a meal. Heat, eat, done.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="background:#1a2e1a;border-radius:40px;">
        <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;">PICK MY MEALS</a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#777777;">Sunday delivery: order by Thursday 8pm<br/>Wednesday delivery: order by Sunday 8pm</p>
    <p style="margin:18px 0 0;font-size:15px;color:#333333;">Hope to feed you soon,<br/><strong>Bukr</strong></p>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#888888;">P.S. New customers can add protein pancakes for just £1.99 until 31 December.</p>
  </td></tr>

  <tr><td align="center" style="background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);">
    prepcuisines &middot; 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:rgba(245,240,232,0.5);">Unsubscribe</a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>
`,
  },
  {
    key: 'december-time-money',
    name: 'December - save 5 hours and £67.20 before Christmas',
    defaultSubject: '{{first_name}}, save 5 hours a week and £67.20 this December',
    intendedFor: 'not_subscribed',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Save time and money this December</title>
<style>
@media only screen and (max-width:560px){
  .outer{padding:10px 8px !important;}
  .inner{padding:22px 16px !important;}
  .h1{font-size:32px !important;line-height:1.08 !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
  .col{display:block !important;width:100% !important;padding:0 0 12px !important;}
  .navpills{display:none !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">December is busy. Get 5 hours a week back and save £67.20 across your first 6 boxes.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;"><tr><td align="center" class="outer" style="padding:20px 10px;">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ece3d0;border-radius:36px;"><tr><td style="padding:16px;">

<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:28px;"><tr><td class="inner" style="padding:28px 28px 32px;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td valign="middle"><img alt="prepcuisines" src="https://www.prepcuisines.co.uk/logo-email.png" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0;"/></td>
    <td class="navpills" align="right" valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.06em;">
      <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;background:#f5f0e8;color:#1a2e1a;text-decoration:none;border-radius:20px;padding:9px 16px;">MENU</a>
      <a href="https://prepcuisines.co.uk/" style="display:inline-block;background:#f5f0e8;color:#1a2e1a;text-decoration:none;border-radius:20px;padding:9px 16px;margin-left:6px;">HOW IT WORKS</a>
    </td>
  </tr></table>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;"><tr><td style="font-size:0;line-height:0;"><img alt="Chef-made, high protein meal prep bowls" src="https://www.prepcuisines.co.uk/december-hero.jpg" width="500" style="display:block;width:100%;height:auto;border:0;border-radius:90px;"/></td></tr></table>

  <h1 class="h1" style="margin:30px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:42px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;text-align:center;color:#f5f0e8;">Get 5 hours a week back and save <span style="color:#c9a84c;">&pound;67.20</span> this December.</h1>
  <p style="margin:18px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;text-align:center;color:#dfe6dc;">Hey {{first_name}}, December gets busy and it gets expensive. Chef-made, high protein meals, delivered fresh to your door, take the food shop, the cooking and the washing up off your plate.</p>
  <div style="margin:26px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#f5f0e8;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">GET MY 40% OFF FIRST BOX</a></td></tr></table></div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:34px;background:#f5f0e8;border-radius:24px;"><tr><td style="padding:16px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td class="stack" valign="middle" width="56%" style="padding:6px 14px 6px 8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a2e1a;">
        <p style="margin:0 0 12px;font-size:17px;font-weight:800;">Whether you're:</p>
        <p style="margin:0 0 8px;"><span style="color:#c9a84c;font-weight:800;">&#10003;</span>&nbsp; Working late</p>
        <p style="margin:0 0 8px;"><span style="color:#c9a84c;font-weight:800;">&#10003;</span>&nbsp; Out doing the Christmas shop</p>
        <p style="margin:0 0 8px;"><span style="color:#c9a84c;font-weight:800;">&#10003;</span>&nbsp; Hosting, travelling or both</p>
        <p style="margin:0 0 14px;"><span style="color:#c9a84c;font-weight:800;">&#10003;</span>&nbsp; Just done with cooking every night</p>
        <p style="margin:0;font-weight:700;">Heat it, eat it, done. Chef-cooked fresh in Stoke-on-Trent, macros on every meal.</p>
      </td>
      <td class="stack" valign="middle" width="44%" style="font-size:0;line-height:0;"><img alt="Our chef at work" src="https://www.prepcuisines.co.uk/december-chef.jpg" width="210" style="display:block;width:100%;height:auto;border:0;border-radius:18px;"/></td>
    </tr></table>
  </td></tr></table>

  <p style="margin:38px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">Where your week goes</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td class="stack" valign="top" width="50%" style="padding:0 6px 0 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">5 hrs</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">back every week</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">Food shop 1 hr<br/>Cooking 3 hrs<br/>Washing up 1 hr</p>
      </td></tr></table>
    </td>
    <td class="stack" valign="top" width="50%" style="padding:0 0 0 6px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">&pound;67.20</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">saved on your first 6 boxes</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">Box 1: 40% off<br/>Boxes 2 to 6: 20% off<br/>Based on 6 meals at &pound;8.00</p>
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center;color:rgba(245,240,232,0.55);">Delivery is charged separately and isn't discounted.</p>

  <p style="margin:38px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">On this week's menu</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Bang Bang Chicken" src="https://www.prepcuisines.co.uk/bang-bang-chicken.jpg" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">525 kcal &middot; 35g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">528 kcal &middot; 50g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">503 kcal &middot; 51g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Protein Pancakes with Strawberries" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/CB1E6F27-C090-4571-A6FC-4BF56089FA02.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Protein Pancakes with Strawberries</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">374 kcal &middot; 25g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;4.49</span>&nbsp; <strong style="font-size:15px;">&pound;1.99</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">new customers, until 31 December</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;"><tr><td style="font-size:0;line-height:0;"><img alt="Fresh meals delivered to your door" src="https://www.prepcuisines.co.uk/december-delivery.jpg" width="500" style="display:block;width:100%;height:auto;border:0;border-radius:24px;"/></td></tr></table>
  <p style="margin:26px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">Order by Thursday 8pm<br/>for Sunday delivery</p>
  <p style="margin:12px 0 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;text-align:center;color:#dfe6dc;">Or order by Sunday 8pm for Wednesday delivery.</p>
  <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#c9a84c;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">PICK MY MEALS</a></td></tr></table>
  <p style="margin:28px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;text-align:center;color:#f5f0e8;">Hope to take some of the load off,<br/><strong>Bukr</strong></p>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#666666;">
    <span style="font-size:16px;font-weight:800;color:#1a2e1a;letter-spacing:-0.5px;">prepcuisines</span><br/>
    102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:#666666;">Unsubscribe</a>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>
`,
  },
  {
    key: 'deadline-tonight',
    name: 'Deadline - order by 8pm tonight (Sunday delivery), 40% then 20%',
    defaultSubject: '{{first_name}}, order by 8pm tonight for Sunday delivery',
    intendedFor: 'not_subscribed',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Order by 8pm tonight</title>
<style>
@media only screen and (max-width:560px){
  .outer{padding:10px 8px !important;}
  .inner{padding:22px 16px !important;}
  .h1{font-size:32px !important;line-height:1.08 !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
  .col{display:block !important;width:100% !important;padding:0 0 12px !important;}
  .navpills{display:none !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">Order by 8pm tonight for Sunday delivery. 40% off your first box, then 20% off your next 5 orders.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;"><tr><td align="center" class="outer" style="padding:20px 10px;">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ece3d0;border-radius:36px;"><tr><td style="padding:16px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:28px;"><tr><td class="inner" style="padding:28px 28px 32px;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td valign="middle"><img alt="prepcuisines" src="https://prepcuisines.co.uk/logo-email.png" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0;"/></td>
    <td class="navpills" align="right" valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.06em;">
      <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;background:#f5f0e8;color:#1a2e1a;text-decoration:none;border-radius:20px;padding:9px 16px;">MENU</a>
    </td>
  </tr></table>

  <p style="margin:30px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;text-align:center;color:#c9a84c;">SUNDAY DELIVERY &middot; CLOSES TONIGHT</p>
  <h1 class="h1" style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:44px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;text-align:center;color:#f5f0e8;">Order by <span style="color:#c9a84c;">8pm tonight</span> to get your box on Sunday.</h1>
  <p style="margin:18px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;text-align:center;color:#dfe6dc;">Hey {{first_name}}, today's the last day to order for this Sunday. Pick your meals now and your discount is applied automatically at checkout.</p>
  <div style="margin:26px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#f5f0e8;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">PICK MY MEALS</a></td></tr></table></div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:34px;"><tr>
    <td class="stack" valign="top" width="50%" style="padding:0 6px 0 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">40%</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">off your first box</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">From &pound;4.80 a meal<br/>No code needed</p>
      </td></tr></table>
    </td>
    <td class="stack" valign="top" width="50%" style="padding:0 0 0 6px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">20%</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">off your next 5 orders</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">When you subscribe<br/>From &pound;6.40 a meal</p>
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center;color:rgba(245,240,232,0.55);">Delivery is charged separately and isn't discounted.</p>

  <p style="margin:38px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">On this week's menu</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Bang Bang Chicken" src="https://prepcuisines.co.uk/bang-bang-chicken.jpg" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">525 kcal &middot; 35g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">528 kcal &middot; 50g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">503 kcal &middot; 51g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your first box</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Protein Pancakes with Strawberries" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/CB1E6F27-C090-4571-A6FC-4BF56089FA02.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Protein Pancakes with Strawberries</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">374 kcal &middot; 25g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;4.49</span>&nbsp; <strong style="font-size:15px;">&pound;1.99</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">new customers, until 31 December</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>

  <p style="margin:26px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">Miss tonight? Order by Sunday 8pm<br/>for Wednesday delivery.</p>
  <div style="margin:22px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#c9a84c;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">ORDER NOW</a></td></tr></table></div>
  <p style="margin:28px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;text-align:center;color:#f5f0e8;">Hope to feed you soon,<br/><strong>Bukr</strong></p>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#666666;">
    <span style="font-size:16px;font-weight:800;color:#1a2e1a;letter-spacing:-0.5px;">prepcuisines</span><br/>
    102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:#666666;">Unsubscribe</a>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>
`,
  },
  {
    key: 'winback-deadline-40',
    name: 'Win-back deadline - 40% waiting, then 20% to 31 Dec (cancelled before Nov)',
    defaultSubject: '{{first_name}}, your 40% off is waiting - order by 8pm tonight',
    intendedFor: 'cancelled_pre_nov_40',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome back</title>
<style>
@media only screen and (max-width:560px){
  .outer{padding:10px 8px !important;}
  .inner{padding:22px 16px !important;}
  .h1{font-size:32px !important;line-height:1.08 !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
  .col{display:block !important;width:100% !important;padding:0 0 12px !important;}
  .navpills{display:none !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">Your 40% off is waiting. Order by 8pm tonight for Sunday delivery, then 20% off every order until 31 December.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;"><tr><td align="center" class="outer" style="padding:20px 10px;">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ece3d0;border-radius:36px;"><tr><td style="padding:16px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:28px;"><tr><td class="inner" style="padding:28px 28px 32px;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td valign="middle"><img alt="prepcuisines" src="https://prepcuisines.co.uk/logo-email.png" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0;"/></td>
    <td class="navpills" align="right" valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.06em;">
      <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;background:#f5f0e8;color:#1a2e1a;text-decoration:none;border-radius:20px;padding:9px 16px;">MENU</a>
    </td>
  </tr></table>

  <p style="margin:30px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;text-align:center;color:#c9a84c;">WELCOME BACK &middot; CLOSES TONIGHT</p>
  <h1 class="h1" style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:44px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;text-align:center;color:#f5f0e8;">Your <span style="color:#c9a84c;">40% off</span> is waiting. Order by 8pm tonight.</h1>
  <p style="margin:18px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;text-align:center;color:#dfe6dc;">Hey {{first_name}}, we've kept 40% off your next order on your account. Order by 8pm tonight and it lands this Sunday. After that, you get 20% off every order until 31 December.</p>
  <div style="margin:26px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#f5f0e8;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">USE MY 40% OFF</a></td></tr></table></div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:34px;"><tr>
    <td class="stack" valign="top" width="50%" style="padding:0 6px 0 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">40%</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">off your next order</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">From &pound;4.80 a meal<br/>Applied automatically</p>
      </td></tr></table>
    </td>
    <td class="stack" valign="top" width="50%" style="padding:0 0 0 6px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">20%</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">off every order after</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">Until 31 December<br/>From &pound;6.40 a meal</p>
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center;color:rgba(245,240,232,0.55);">Delivery is charged separately and isn't discounted. Protein pancakes stay at full price.</p>

  <p style="margin:38px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">On this week's menu</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Bang Bang Chicken" src="https://prepcuisines.co.uk/bang-bang-chicken.jpg" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">525 kcal &middot; 35g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your next order</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">528 kcal &middot; 50g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your next order</p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">503 kcal &middot; 51g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your next order</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Chicken Alfredo Pasta" src="https://cdn.shopify.com/s/files/1/0962/3348/8716/files/4F210A0B-E7ED-4F60-8C07-FEE9812887DB.jpg?v=1766849087" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Chicken Alfredo Pasta with Broccoli</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">555 kcal &middot; 49g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;4.80</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">on your next order</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>

  <p style="margin:26px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">Miss tonight? Order by Sunday 8pm<br/>for Wednesday delivery.</p>
  <div style="margin:22px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#c9a84c;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">ORDER NOW</a></td></tr></table></div>
  <p style="margin:28px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;text-align:center;color:#f5f0e8;">Hope to feed you again soon,<br/><strong>Bukr</strong></p>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#666666;">
    <span style="font-size:16px;font-weight:800;color:#1a2e1a;letter-spacing:-0.5px;">prepcuisines</span><br/>
    102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:#666666;">Unsubscribe</a>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>
`,
  },
  {
    key: 'winback-deadline-20',
    name: 'Win-back deadline - 20% to 31 Dec (cancelled before Nov)',
    defaultSubject: '{{first_name}}, 20% off every order until 31 Dec - order by 8pm tonight',
    intendedFor: 'cancelled_pre_nov_20',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Welcome back</title>
<style>
@media only screen and (max-width:560px){
  .outer{padding:10px 8px !important;}
  .inner{padding:22px 16px !important;}
  .h1{font-size:32px !important;line-height:1.08 !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
  .col{display:block !important;width:100% !important;padding:0 0 12px !important;}
  .navpills{display:none !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;">20% off every order until 31 December. Order by 8pm tonight for Sunday delivery.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;"><tr><td align="center" class="outer" style="padding:20px 10px;">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ece3d0;border-radius:36px;"><tr><td style="padding:16px;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:28px;"><tr><td class="inner" style="padding:28px 28px 32px;">

  <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td valign="middle"><img alt="prepcuisines" src="https://prepcuisines.co.uk/logo-email.png" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0;"/></td>
    <td class="navpills" align="right" valign="middle" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.06em;">
      <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;background:#f5f0e8;color:#1a2e1a;text-decoration:none;border-radius:20px;padding:9px 16px;">MENU</a>
    </td>
  </tr></table>

  <p style="margin:30px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;text-align:center;color:#c9a84c;">WELCOME BACK &middot; CLOSES TONIGHT</p>
  <h1 class="h1" style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:44px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;text-align:center;color:#f5f0e8;"><span style="color:#c9a84c;">20% off</span> every order until 31 December.</h1>
  <p style="margin:18px 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;text-align:center;color:#dfe6dc;">Hey {{first_name}}, we'd love to feed you again, so we've put 20% off on your account. Order by 8pm tonight and your box lands this Sunday.</p>
  <div style="margin:26px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#f5f0e8;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">PICK MY MEALS</a></td></tr></table></div>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:34px;"><tr>
    <td class="stack" valign="top" width="50%" style="padding:0 6px 0 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">20%</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">off every order</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">Until 31 December<br/>Applied automatically</p>
      </td></tr></table>
    </td>
    <td class="stack" valign="top" width="50%" style="padding:0 0 0 6px;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:26px 18px;font-family:Helvetica,Arial,sans-serif;color:#1a2e1a;">
        <p style="margin:0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-2px;">&pound;6.40</p>
        <p style="margin:6px 0 12px;font-size:15px;font-weight:800;">a meal</p>
        <p style="margin:0;font-size:12px;line-height:1.6;">Instead of &pound;8.00<br/>Chef-made, high protein</p>
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;text-align:center;color:rgba(245,240,232,0.55);">Delivery is charged separately and isn't discounted. Protein pancakes stay at full price.</p>

  <p style="margin:38px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">On this week's menu</p>
  <table border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Bang Bang Chicken" src="https://prepcuisines.co.uk/bang-bang-chicken.jpg" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">525 kcal &middot; 35g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;6.40</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">with your 20% off</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">528 kcal &middot; 50g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;6.40</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">with your 20% off</p>
          </td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">503 kcal &middot; 51g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;6.40</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">with your 20% off</p>
          </td></tr>
        </table>
      </td>
      <td class="col" valign="top" width="50%" style="padding:0 6px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:20px;overflow:hidden;">
          <tr><td style="font-size:0;line-height:0;"><img alt="Chicken Alfredo Pasta" src="https://cdn.shopify.com/s/files/1/0962/3348/8716/files/4F210A0B-E7ED-4F60-8C07-FEE9812887DB.jpg?v=1766849087" width="236" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0;"/></td></tr>
          <tr><td style="padding:14px 16px 16px;font-family:Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;line-height:1.3;color:#1a2e1a;">Chicken Alfredo Pasta with Broccoli</p>
            <p style="margin:0 0 4px;font-size:12px;color:#555555;">555 kcal &middot; 49g protein</p>
            <p style="margin:0;font-size:13px;color:#1a2e1a;"><span style="text-decoration:line-through;color:#999999;">&pound;8.00</span>&nbsp; <strong style="font-size:15px;">&pound;6.40</strong></p>
            <p style="margin:3px 0 0;font-size:11px;color:#666666;">with your 20% off</p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>

  <p style="margin:26px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-1px;text-align:center;color:#f5f0e8;">Miss tonight? Order by Sunday 8pm<br/>for Wednesday delivery.</p>
  <div style="margin:22px 0 0;"><table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td align="center" style="background:#c9a84c;border-radius:40px;"><a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 34px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.04em;color:#1a2e1a;text-decoration:none;">ORDER NOW</a></td></tr></table></div>
  <p style="margin:28px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;text-align:center;color:#f5f0e8;">Hope to feed you again soon,<br/><strong>Bukr</strong></p>

  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:30px;background:#f5f0e8;border-radius:22px;"><tr><td align="center" style="padding:22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#666666;">
    <span style="font-size:16px;font-weight:800;color:#1a2e1a;letter-spacing:-0.5px;">prepcuisines</span><br/>
    102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:#666666;">Unsubscribe</a>
  </td></tr></table>

</td></tr></table>
</td></tr></table>
</td></tr></table>
</body></html>
`,
  },
  {
    key: 'weekly-menu',
    name: "This week's menu - fresh meals, order by Thursday",
    defaultSubject: "{{first_name}}, this week's menu is live",
    intendedFor: 'any',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>This week's menu</title>
<style>
@media only screen and (max-width:520px){
  .pad{padding-left:20px !important;padding-right:20px !important;}
  .h1{font-size:28px !important;}
  .mealimg{width:120px !important;}
  .mealimg img{width:120px !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
<div style="display:none;max-height:0;overflow:hidden;">Fresh chef-made meals, macros on every one. Order by Thursday 8pm for Sunday delivery.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">

  <tr><td class="pad" style="background:#1a2e1a;padding:30px 30px 34px;text-align:center;">
    <img alt="prepcuisines" src="https://www.prepcuisines.co.uk/logo-email.png" width="400" style="display:block;width:400px;max-width:100%;height:auto;margin:0 auto 26px;border:0;"/>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">THIS WEEK'S MENU</p>
    <h1 class="h1" style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.15;color:#f5f0e8;">This week's menu is live.</h1>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:34px 36px 20px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333;">
    <p style="margin:0 0 14px;">Hey {{first_name}},</p>
    <p style="margin:0;">Chef-made, high protein meals, cooked fresh in Stoke-on-Trent and delivered to your door. Here's some of what's on this week, with the macros on every one:</p>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Bang Bang Chicken" src="https://www.prepcuisines.co.uk/bang-bang-chicken.jpg" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Bang Bang Chicken with Rice and Cucumber Slaw</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">525 kcal &middot; 35g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><strong>&pound;8.00</strong></p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Peri Rosa Chicken Rigatoni" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/54E9D387-545B-4D9B-AA99-3F93705571BF.png" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Peri Rosa Chicken Rigatoni with Peas</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">528 kcal &middot; 50g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><strong>&pound;8.00</strong></p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Turkish Beef Pasta" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/ChatGPT%20Image%20Sep%201,%202026,%2006_09_24%20PM.png" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Turkish Beef Pasta with Garlic Yoghurt</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">503 kcal &middot; 51g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><strong>&pound;8.00</strong></p>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:0 36px 14px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;border-radius:12px;overflow:hidden;">
      <tr>
        <td class="mealimg" width="170" valign="middle" style="width:170px;background:#e8e0d0;"><img alt="Protein Pancakes with Strawberries" src="https://moqvizvlfqmehzhutzds.supabase.co/storage/v1/object/public/menu-images/CB1E6F27-C090-4571-A6FC-4BF56089FA02.png" width="170" style="display:block;width:170px;height:auto;border:0;"/></td>
        <td valign="middle" style="padding:14px 16px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.3;color:#1a2e1a;">Protein Pancakes with Strawberries</p>
          <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">374 kcal &middot; 25g protein</p>
          <p style="margin:0;font-size:13px;color:#1a2e1a;"><strong>&pound;4.49</strong></p>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:16px 36px 8px;text-align:center;">
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">ALSO ON THIS WEEK</p>
  </td></tr>
  <tr><td class="pad" style="background:#ffffff;padding:8px 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:12px;">
      <tr><td style="padding:18px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#f5f0e8;">
        <p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Chicken Alfredo Pasta with Broccoli</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Chicken Burrito Bowl</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Creamy Cajun Chicken with Rice and Peas</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Crispy Chickpeas &amp; Hot Honey Halloumi</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Garlic Herb Cajun Chicken with Mash and Green Beans</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Jerk Chicken with Rice, Kidney Beans and Carrots</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Mexican Chicken Rice Cazuela with Peppers</p><p style="margin:0;padding:9px 0;border-bottom:1px solid rgba(245,240,232,0.15);"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Mexicano Burrito</p><p style="margin:0;padding:9px 0 0;"><span style="color:#c9a84c;font-weight:700;">&#10003;</span>&nbsp; Sweet Chilli Chicken with Rice, Peppers and Green Beans</p>
      </td></tr>
    </table>
    <p style="margin:12px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#555555;text-align:center;">Plus overnight oats and protein cookie dough, to make it a full week.</p>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:26px 36px 40px;text-align:center;font-family:Helvetica,Arial,sans-serif;">
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="background:#1a2e1a;border-radius:40px;">
        <a href="https://prepcuisines.co.uk/menu" style="display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;">SEE THE FULL MENU</a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#555555;">If you have a discount waiting on your account, it's applied automatically at checkout.</p>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#777777;">Sunday delivery: order by Thursday 8pm<br/>Wednesday delivery: order by Sunday 8pm</p>
    <p style="margin:18px 0 0;font-size:15px;color:#333333;">Hope to feed you soon,<br/><strong>Bukr</strong></p>
  </td></tr>

  <tr><td align="center" style="background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);">
    prepcuisines &middot; 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:rgba(245,240,232,0.5);">Unsubscribe</a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>
`,
  },
  {
    key: 'winback-20-dpd',
    name: 'Win-back - DPD fixed, 20% to 31 Dec',
    defaultSubject: '{{first_name}}, 20% off every order until 31 December',
    intendedFor: 'cancelled_20',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>20% off until 31 December</title>
<style>
@media only screen and (max-width:520px){
  .pad{padding-left:20px !important;padding-right:20px !important;}
  .h1{font-size:28px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
<div style="display:none;max-height:0;overflow:hidden;">20% off every order until 31 December, and DPD is more reliable than ever.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">

  <tr><td class="pad" style="background:#1a2e1a;padding:30px 30px 34px;text-align:center;">
    <img alt="prepcuisines" src="https://www.prepcuisines.co.uk/logo-email.png" width="400" style="display:block;width:400px;max-width:100%;height:auto;margin:0 auto 26px;border:0;"/>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">WE'D LOVE TO FEED YOU AGAIN</p>
    <h1 class="h1" style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.15;color:#f5f0e8;">20% off every order until 31 December.</h1>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:34px 36px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333;">
    <p style="margin:0 0 14px;">Hey {{first_name}},</p>
    <p style="margin:0 0 14px;">We'd love to feed you again, so we've put 20% off on your account:</p>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:12px;">
      <tr><td align="center" style="padding:28px 16px;">
        <p style="margin:0;font-family:Georgia,serif;font-size:56px;line-height:1;color:#1a2e1a;">20%</p>
        <p style="margin:6px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:#1a2e1a;">off every order</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#1a2e1a;">until 31 December, applied automatically</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 40px;text-align:center;font-family:Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#555555;">Chef-made, high protein, from £4.80 a meal. Heat, eat, done.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="background:#1a2e1a;border-radius:40px;">
        <a href="https://prepcuisines.co.uk/login" style="display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;">LOG IN AND ORDER</a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#777777;">Sunday delivery: order by Thursday 8pm<br/>Wednesday delivery: order by Sunday 8pm</p>
    <p style="margin:18px 0 0;font-size:15px;color:#333333;">Hope to feed you again soon,<br/><strong>Bukr</strong></p>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#888888;">P.S. If you ever had an issue with a delivery, we're sorry. DPD is back up and running and more reliable than ever.</p>
  </td></tr>

  <tr><td align="center" style="background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);">
    prepcuisines &middot; 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:rgba(245,240,232,0.5);">Unsubscribe</a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>
`,
  },
  {
    key: 'winback-40-dpd',
    name: 'Win-back - DPD fixed, 40% then 20% to 31 Dec',
    defaultSubject: '{{first_name}}, your 40% off is waiting (DPD is more reliable than ever)',
    intendedFor: 'cancelled_40',
    nameFallback: 'there',
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>your 40% off is waiting</title>
<style>
@media only screen and (max-width:520px){
  .pad{padding-left:20px !important;padding-right:20px !important;}
  .h1{font-size:28px !important;}
  .stack{display:block !important;width:100% !important;padding:0 0 14px !important;}
}
</style></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
<div style="display:none;max-height:0;overflow:hidden;">DPD is more reliable than ever, your 40% off is still waiting, then 20% off until 31 December.</div>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;">

  <tr><td class="pad" style="background:#1a2e1a;padding:30px 30px 34px;text-align:center;">
    <img alt="prepcuisines" src="https://www.prepcuisines.co.uk/logo-email.png" width="400" style="display:block;width:400px;max-width:100%;height:auto;margin:0 auto 26px;border:0;"/>
    <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.12em;color:#c9a84c;">WE'D LOVE TO FEED YOU AGAIN</p>
    <h1 class="h1" style="margin:10px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:32px;line-height:1.15;color:#f5f0e8;">Your 40% off is still waiting.</h1>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:34px 36px 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333;">
    <p style="margin:0 0 14px;">Hey {{first_name}},</p>
    <p style="margin:0 0 14px;">We've kept your discount safe for you, and there's a bit more on top:</p>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 8px;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td class="stack" valign="top" width="50%" style="padding:0 8px 0 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#c9a84c;border-radius:12px;">
          <tr><td align="center" style="padding:26px 14px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:50px;line-height:1;color:#1a2e1a;">40%</p>
            <p style="margin:6px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#1a2e1a;">off your next order</p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1a2e1a;">applied automatically</p>
          </td></tr>
        </table>
      </td>
      <td class="stack" valign="top" width="50%" style="padding:0 0 0 8px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#1a2e1a;border-radius:12px;">
          <tr><td align="center" style="padding:26px 14px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:50px;line-height:1;color:#c9a84c;">20%</p>
            <p style="margin:6px 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#f5f0e8;">off every order after</p>
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#f5f0e8;">until 31 December</p>
          </td></tr>
        </table>
      </td>
    </tr></table>
  </td></tr>

  <tr><td class="pad" style="background:#ffffff;padding:20px 36px 40px;text-align:center;font-family:Helvetica,Arial,sans-serif;">
    <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#555555;">Chef-made, high protein, from £4.80 a meal. Heat, eat, done.</p>
    <table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
      <tr><td align="center" style="background:#1a2e1a;border-radius:40px;">
        <a href="https://prepcuisines.co.uk/login" style="display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;">LOG IN AND ORDER</a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#777777;">Sunday delivery: order by Thursday 8pm<br/>Wednesday delivery: order by Sunday 8pm</p>
    <p style="margin:18px 0 0;font-size:15px;color:#333333;">Hope to feed you again soon,<br/><strong>Bukr</strong></p>
    <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#888888;">P.S. If you ever had an issue with a delivery, we're sorry. DPD is back up and running and more reliable than ever.</p>
  </td></tr>

  <tr><td align="center" style="background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);">
    prepcuisines &middot; 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:rgba(245,240,232,0.5);">Unsubscribe</a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>
`,
  },
  {
    key: 'winback-40',
    name: 'Win-back - your 40% is waiting',
    defaultSubject: '{{first_name}}, your 40% off is waiting',
    intendedFor: 'cancelled_40',
    nameFallback: 'there',
    html: plain([
      'Hey {{first_name}},',
      'Quick one. Your <strong>40% off your next order</strong> is still waiting on your account. No code needed, it comes off automatically when you come back.',
      'Chef-made, high protein, from £4.80 a meal. Heat, eat, done.',
      'Log in to restart your subscription: <a href="https://prepcuisines.co.uk/login" style="color:#1a2e1a;font-weight:600;">prepcuisines.co.uk/login</a>',
      CUTOFFS,
      '— Bukr',
    ]),
  },
  {
    key: 'payday',
    name: 'Payday deal',
    defaultSubject: '{{first_name}}, payday = 40% off your first box',
    intendedFor: 'not_subscribed',
    nameFallback: 'there',
    html: plain([
      'Hey {{first_name}},',
      "Payday's here, so here's the deal:",
      '<strong>40% off your first box.</strong> No code needed.<br/>Chef-made, high protein, from £4.80 a meal.',
      '<strong>New:</strong> add protein pancakes for just <strong>£1.99</strong>. Breakfast sorted too.',
      'Treat yourself properly this month. No cooking, no washing up, no takeaway guilt.',
      ORDER_LINK,
      CUTOFFS,
      '— Bukr',
    ]),
  },
  {
    key: 'payday-last-call',
    name: 'Payday deal - last reminder',
    defaultSubject: '{{first_name}}, last payday reminder: 40% off',
    intendedFor: 'not_subscribed',
    nameFallback: 'there',
    html: plain([
      'Hey {{first_name}},',
      'Quick one. If payday has landed, your <strong>40% off your first box</strong> is still waiting. No code needed.',
      '<strong>New:</strong> add protein pancakes for just <strong>£1.99</strong>. Breakfast sorted too.',
      'Chef-made, high protein, from £4.80 a meal. Heat, eat, done.',
      ORDER_LINK,
      CUTOFFS,
      '— Bukr',
    ]),
  },
  {
    key: 'fired-whats-for-dinner',
    name: "You're fired - What's for dinner?",
    defaultSubject: "you're fired",
    intendedFor: 'not_subscribed',
    html: "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>you're fired \u2014 what's for dinner</title>\n<style>\n@media only screen and (max-width:520px){\n  .pad{padding-left:20px !important;padding-right:20px !important;}\n  .h1{font-size:30px !important;}\n  .stack{display:block !important;width:100% !important;padding:0 0 16px !important;}\n}\n</style></head>\n<body style=\"margin:0;padding:0;background:#f5f0e8;\">\n<!-- Preheader -->\n<div style=\"display:none;max-height:0;overflow:hidden;\">Every night, the same question. Consider this your notice.</div>\n<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#f5f0e8;padding:20px 10px;\">\n<tr><td align=\"center\">\n<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"560\" style=\"max-width:560px;width:100%;\">\n\n  <!-- Top: green with logo + mail window -->\n  <tr><td class=\"pad\" style=\"background:#1a2e1a;padding:30px 30px 40px;\">\n    <img alt=\"prepcuisines\" src=\"https://www.prepcuisines.co.uk/logo-email.png\" width=\"170\" style=\"display:block;height:auto;margin:0 auto 28px;\"/>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#ffffff;border-radius:10px;\">\n      <tr><td style=\"background:#ece6da;border-radius:10px 10px 0 0;padding:11px 14px;\">\n        <span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#e05b4f;margin-right:5px;\"></span><span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#e7b53c;margin-right:5px;\"></span><span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#5bb35a;\"></span>\n      </td></tr>\n      <tr><td style=\"padding:4px 20px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a8a8a;\">\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">To: <strong style=\"color:#1a2e1a;\">What's for dinner?</strong></p>\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">Cc: <strong style=\"color:#1a2e1a;\">\"I don't mind, what do you fancy?\"</strong></p>\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">Subject: <strong style=\"color:#1a2e1a;\">you're fired</strong></p>\n      </td></tr>\n      <tr><td style=\"padding:18px 20px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#222222;\">\n        <p style=\"margin:0 0 14px;\">Consider this your notice, effective immediately.</p>\n        <p style=\"margin:0 0 6px;\">I'm off to:</p>\n        <p style=\"margin:0 0 14px;\">\n          - skip the food shop and the cooking<br/>\n          - save hours every single week<br/>\n          - have my meals prepped for the whole week before Monday<br/>\n          - eat healthy without even thinking about it<br/>\n          - actually feel good for once\n        </p>\n        <p style=\"margin:0 0 14px;\">If you need me, I'll be eating. Pls don't reach out\u2026</p>\n        <p style=\"margin:0;font-weight:700;\">{{first_name}} x</p>\n      </td></tr>\n    </table>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"margin:28px auto 0;\">\n      <tr><td align=\"center\" style=\"background:#c9a84c;border-radius:40px;\">\n        <a href=\"https://prepcuisines.co.uk/menu\" style=\"display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#1a2e1a;text-decoration:none;\">SORT MY DINNERS</a>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Middle: the case -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:44px 36px 16px;text-align:center;\">\n    <h1 class=\"h1\" style=\"margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;line-height:1.15;color:#1a2e1a;\">Honestly? \"What's for dinner?\" has been doing your head in for ages.</h1>\n    <p style=\"margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#444444;\">\n      Every night, the same question. Nothing in, nothing sounds good, and it ends in a takeaway you didn't really want. So sack it.\n      <strong style=\"color:#1a2e1a;\">Pick your meals once, we cook them fresh, they arrive chilled.</strong> Every dinner, already decided x\n    </p>\n  </td></tr>\n\n  <!-- Week decided -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:32px 36px 0;\">\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border:2px solid #1a2e1a;border-radius:12px;\">\n      <tr><td style=\"padding:22px 24px 6px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7a6b;\">What's for dinner this week?</td></tr>\n      <tr><td style=\"padding:0 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1a2e1a;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"><tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Monday</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;color:#1a2e1a;\"><span style=\"color:#c9a84c;\">\u2713</span> Decided</td></tr><tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Tuesday</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;color:#1a2e1a;\"><span style=\"color:#c9a84c;\">\u2713</span> Decided</td></tr><tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Wednesday</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;color:#1a2e1a;\"><span style=\"color:#c9a84c;\">\u2713</span> Decided</td></tr><tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Thursday</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;color:#1a2e1a;\"><span style=\"color:#c9a84c;\">\u2713</span> Decided</td></tr><tr><td style=\"padding:10px 0;\">Friday</td><td align=\"right\" style=\"padding:10px 0;font-weight:700;color:#1a2e1a;\"><span style=\"color:#c9a84c;\">\u2713</span> Decided</td></tr></table>\n      </td></tr>\n      <tr><td align=\"center\" style=\"background:#1a2e1a;border-radius:0 0 10px 10px;padding:20px 24px;\">\n        <p style=\"margin:0;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#c9a84c;\">Asked and answered</p>\n        <p style=\"margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#f5f0e8;\">in about two minutes, once a week</p>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Checklist card + offer -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:28px 36px 44px;\">\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"><tr>\n      <td class=\"stack\" valign=\"top\" width=\"58%\" style=\"padding:0 10px 16px 0;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#1a2e1a;border-radius:12px;\">\n          <tr><td style=\"padding:22px 22px 8px;font-family:Georgia,serif;font-size:22px;color:#c9a84c;\">prepcuisines</td></tr>\n          <tr><td style=\"padding:0 22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#f5f0e8;line-height:1.4;\">\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No 7pm fridge stare</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No \"what do you fancy?\"</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No last-minute takeaway</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; Chef-made from fresh</p>\n            <p style=\"margin:0;padding:12px 0 0;\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; Every dinner decided</p>\n          </td></tr>\n        </table>\n      </td>\n      <td class=\"stack\" valign=\"middle\" width=\"42%\" style=\"padding:0 0 16px 10px;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#c9a84c;border-radius:12px;\">\n          <tr><td align=\"center\" style=\"padding:30px 16px;\">\n            <p style=\"margin:0;font-family:Georgia,serif;font-size:52px;line-height:1;color:#1a2e1a;\">40%</p>\n            <p style=\"margin:6px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#1a2e1a;\">off your first box</p>\n            <p style=\"margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1a2e1a;\">then 20% off your next 5 when you subscribe</p>\n          </td></tr>\n        </table>\n      </td>\n    </tr></table>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"margin:18px auto 0;\">\n      <tr><td align=\"center\" style=\"background:#1a2e1a;border-radius:40px;\">\n        <a href=\"https://prepcuisines.co.uk/menu\" style=\"display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;\">PICK THIS WEEK'S MEALS</a>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Footer -->\n  <tr><td align=\"center\" style=\"background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);\">\n    prepcuisines \u00b7 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>\n    <a href=\"{{unsubscribe_url}}\" style=\"color:rgba(245,240,232,0.5);\">Unsubscribe</a>\n  </td></tr>\n\n</table>\n</td></tr>\n</table>\n</body></html>\n",
  },
  {
    key: 'fired-week-back',
    name: "You're fired - Get your week back",
    defaultSubject: "you're fired",
    intendedFor: 'not_subscribed',
    html: "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>you're fired</title>\n<style>\n@media only screen and (max-width:520px){\n  .pad{padding-left:20px !important;padding-right:20px !important;}\n  .h1{font-size:30px !important;}\n  .stack{display:block !important;width:100% !important;padding:0 0 16px !important;}\n}\n</style></head>\n<body style=\"margin:0;padding:0;background:#f5f0e8;\">\n<!-- Preheader -->\n<div style=\"display:none;max-height:0;overflow:hidden;\">5 hours a week. Consider this your notice.</div>\n<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#f5f0e8;padding:20px 10px;\">\n<tr><td align=\"center\">\n<table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"560\" style=\"max-width:560px;width:100%;\">\n\n  <!-- Top: green with logo + mail window -->\n  <tr><td class=\"pad\" style=\"background:#1a2e1a;padding:30px 30px 40px;\">\n    <img alt=\"prepcuisines\" src=\"https://www.prepcuisines.co.uk/logo-email.png\" width=\"170\" style=\"display:block;height:auto;margin:0 auto 28px;\"/>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#ffffff;border-radius:10px;\">\n      <tr><td style=\"background:#ece6da;border-radius:10px 10px 0 0;padding:11px 14px;\">\n        <span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#e05b4f;margin-right:5px;\"></span><span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#e7b53c;margin-right:5px;\"></span><span style=\"display:inline-block;width:11px;height:11px;border-radius:6px;background:#5bb35a;\"></span>\n      </td></tr>\n      <tr><td style=\"padding:4px 20px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#8a8a8a;\">\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">To: <strong style=\"color:#1a2e1a;\">Cooking</strong></p>\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">Cc: <strong style=\"color:#1a2e1a;\">the washing up</strong></p>\n        <p style=\"margin:0;padding:10px 0;border-bottom:1px solid #eee;\">Subject: <strong style=\"color:#1a2e1a;\">you're fired</strong></p>\n      </td></tr>\n      <tr><td style=\"padding:18px 20px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.65;color:#222222;\">\n        <p style=\"margin:0 0 14px;\">Consider this your notice, effective immediately.</p>\n        <p style=\"margin:0 0 6px;\">I'm off to:</p>\n        <p style=\"margin:0 0 14px;\">\n          - get my week back (5 hours of it, to be exact)<br/>\n          - never cook after a long day again<br/>\n          - leave the kitchen clean for once<br/>\n          - say goodbye to the washing-up pile forever\n        </p>\n        <p style=\"margin:0 0 14px;\">If you need me, I'll be on the sofa. Pls don't reach out\u2026</p>\n        <p style=\"margin:0;font-weight:700;\">{{first_name}} x</p>\n      </td></tr>\n    </table>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"margin:28px auto 0;\">\n      <tr><td align=\"center\" style=\"background:#c9a84c;border-radius:40px;\">\n        <a href=\"https://prepcuisines.co.uk/menu\" style=\"display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#1a2e1a;text-decoration:none;\">GET YOUR WEEK BACK</a>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Middle: the case -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:44px 36px 16px;text-align:center;\">\n    <h1 class=\"h1\" style=\"margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;line-height:1.15;color:#1a2e1a;\">Honestly? Cooking's been stealing your week for ages.</h1>\n    <p style=\"margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#444444;\">\n      The food shop, the prep, the cooking, the cleaning, the washing up. It all adds up. So sack it.\n      <strong style=\"color:#1a2e1a;\">Pick your meals, we cook them fresh, they arrive chilled.</strong> Heat, eat, done x\n    </p>\n  </td></tr>\n\n  <!-- Hours back -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:32px 36px 0;\">\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"border:2px solid #1a2e1a;border-radius:12px;\">\n      <tr><td style=\"padding:22px 24px 6px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#6b7a6b;\">Where your week goes</td></tr>\n      <tr><td style=\"padding:0 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#1a2e1a;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\">\n          <tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Food shop</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;\">1 hr</td></tr>\n          <tr><td style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;\">Prep and cooking</td><td align=\"right\" style=\"padding:10px 0;border-bottom:1px solid #e8e0d0;font-weight:700;\">3 hrs</td></tr>\n          <tr><td style=\"padding:10px 0;\">Cleaning and washing up</td><td align=\"right\" style=\"padding:10px 0;font-weight:700;\">1 hr</td></tr>\n        </table>\n      </td></tr>\n      <tr><td align=\"center\" style=\"background:#1a2e1a;border-radius:0 0 10px 10px;padding:20px 24px;\">\n        <p style=\"margin:0;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#c9a84c;\">5 hours back</p>\n        <p style=\"margin:4px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#f5f0e8;\">every single week</p>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Checklist card + offer -->\n  <tr><td class=\"pad\" style=\"background:#ffffff;padding:28px 36px 44px;\">\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\"><tr>\n      <td class=\"stack\" valign=\"top\" width=\"58%\" style=\"padding:0 10px 16px 0;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#1a2e1a;border-radius:12px;\">\n          <tr><td style=\"padding:22px 22px 8px;font-family:Georgia,serif;font-size:22px;color:#c9a84c;\">prepcuisines</td></tr>\n          <tr><td style=\"padding:0 22px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#f5f0e8;line-height:1.4;\">\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No cooking</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No cleaning</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; No washing up</p>\n            <p style=\"margin:0;padding:12px 0;border-bottom:1px solid rgba(245,240,232,0.15);\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; Chef-made from fresh</p>\n            <p style=\"margin:0;padding:12px 0 0;\"><span style=\"color:#c9a84c;font-weight:700;\">\u2713</span>&nbsp; Your week back</p>\n          </td></tr>\n        </table>\n      </td>\n      <td class=\"stack\" valign=\"middle\" width=\"42%\" style=\"padding:0 0 16px 10px;\">\n        <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"background:#c9a84c;border-radius:12px;\">\n          <tr><td align=\"center\" style=\"padding:30px 16px;\">\n            <p style=\"margin:0;font-family:Georgia,serif;font-size:52px;line-height:1;color:#1a2e1a;\">40%</p>\n            <p style=\"margin:6px 0 14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;color:#1a2e1a;\">off your first box</p>\n            <p style=\"margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#1a2e1a;\">then 20% off your next 5 when you subscribe</p>\n          </td></tr>\n        </table>\n      </td>\n    </tr></table>\n\n    <table border=\"0\" cellpadding=\"0\" cellspacing=\"0\" align=\"center\" style=\"margin:18px auto 0;\">\n      <tr><td align=\"center\" style=\"background:#1a2e1a;border-radius:40px;\">\n        <a href=\"https://prepcuisines.co.uk/menu\" style=\"display:inline-block;padding:16px 36px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;letter-spacing:0.06em;color:#f5f0e8;text-decoration:none;\">SEE THIS WEEK'S MENU</a>\n      </td></tr>\n    </table>\n  </td></tr>\n\n  <!-- Footer -->\n  <tr><td align=\"center\" style=\"background:#1a2e1a;padding:24px 30px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:rgba(245,240,232,0.5);\">\n    prepcuisines \u00b7 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>\n    <a href=\"{{unsubscribe_url}}\" style=\"color:rgba(245,240,232,0.5);\">Unsubscribe</a>\n  </td></tr>\n\n</table>\n</td></tr>\n</table>\n</body></html>\n",
  },
]

// Simple image + subject email for the batched Image Campaign flow - an
// image (clickable through to the menu) with a plain subject, no template
// picker needed. Kept next to the HTML templates since it uses the same
// {{first_name}}/{{unsubscribe_url}} placeholders and rendering helpers.
export function buildImageCampaignHtml(o: { imageUrl: string; firstName?: string | null; unsubscribeUrl: string }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://prepcuisines.co.uk'
  return renderCampaignHtml(
    `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f0e8;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f0e8;padding:20px 10px;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:#ffffff;">
  <tr><td style="padding:0;"><a href="${siteUrl}/menu" style="display:block;"><img src="{{image_src}}" alt="prepcuisines" width="560" style="display:block;width:100%;height:auto;border:0;"/></a></td></tr>
  <tr><td align="center" style="padding:24px 28px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.7;color:#999999;">
    prepcuisines &middot; 102A Sun Street, Stoke-on-Trent, ST1 4JR<br/>
    <a href="{{unsubscribe_url}}" style="color:#999999;">Unsubscribe</a>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`.split('{{image_src}}').join(o.imageUrl),
    { firstName: o.firstName, unsubscribeUrl: o.unsubscribeUrl },
    'there'
  )
}

export function getCampaignTemplate(key: string) {
  return CAMPAIGN_TEMPLATES.find((t) => t.key === key) || null
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function firstNameOf(name?: string | null) {
  const f = (name || '').trim().split(/\s+/)[0] || ''
  return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : ''
}

// Subject lines can use {{first_name}} too. With no name, "{{first_name}}, "
// is dropped and the rest starts with a capital letter.
export function renderCampaignSubject(subject: string, firstName?: string | null) {
  const first = firstNameOf(firstName)
  if (first) return subject.split('{{first_name}}').join(first)
  const s = subject.replace(/\{\{first_name\}\},?\s*/g, '').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function renderCampaignHtml(
  html: string,
  vars: { firstName?: string | null; unsubscribeUrl: string },
  nameFallback = 'Me'
) {
  const first = firstNameOf(vars.firstName) || nameFallback
  return html
    .split('{{first_name}}').join(escapeHtml(first))
    .split('{{unsubscribe_url}}').join(vars.unsubscribeUrl)
}
