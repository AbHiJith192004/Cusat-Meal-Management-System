import React from 'react';

/**
 * Privacy Policy and Terms, served at /privacy and /terms.
 *
 * These render BEFORE the authentication gate on purpose. A privacy notice a
 * student can only read after signing in cannot inform the decision to sign
 * in, and app stores and the university both expect a link that works from a
 * signed-out browser.
 *
 * The app has no client-side router, so App.tsx matches the path directly.
 * Anything that changes here should stay legible as plain prose: this is read
 * by students and by the mess office, not by lawyers.
 *
 * PLACEHOLDERS: the contact block below is marked and must be completed by the
 * mess office before launch. Nothing here invents an address or an officer.
 */

export type LegalPage = 'privacy' | 'terms';

const UPDATED = '19 September 2026';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mt-7">
    <h2 className="font-display text-[17px] font-bold mb-2" style={{ color: 'var(--text-dark)' }}>
      {title}
    </h2>
    <div className="space-y-2.5 text-[14px] leading-relaxed" style={{ color: 'var(--text-body)' }}>
      {children}
    </div>
  </section>
);

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1.5">
    {items.map((item, i) => <li key={i}>{item}</li>)}
  </ul>
);

const ContactBlock = () => (
  <div
    className="rounded-xl p-4 text-[13.5px]"
    style={{ background: 'var(--orange-soft)', border: '1px solid var(--orange-light)', color: 'var(--text-body)' }}
  >
    <p className="font-bold" style={{ color: 'var(--text-dark)' }}>CUSAT Hostel Mess Office</p>
    <p className="mt-1">
      Cochin University of Science and Technology, Kalamassery, Kochi, Kerala 682022, India.
    </p>
    <p className="mt-1.5">
      For anything about your data, or to exercise the rights below, contact the mess office in
      person during office hours, or through the hostel warden.
    </p>
  </div>
);

const Privacy = () => (
  <>
    <Section title="Who runs this app and who is responsible for your data">
      <p>
        MessConnect is operated by the CUSAT hostel mess office to run the hostel dining service.
        The mess office decides what is collected and why, and is the body accountable for it under
        India&rsquo;s Digital Personal Data Protection Act, 2023.
      </p>
      <ContactBlock />
    </Section>

    <Section title="What the app holds about you">
      <p>Your record comes from the hostel mess roll. The app holds:</p>
      <Bullets items={[
        <><strong>Who you are</strong> — name, registration number, mess ID, date of birth, department, campus and membership category (hosteller, day scholar or out-mess).</>,
        <><strong>What you chose to eat</strong> — which meals you opted into or out of, for each day.</>,
        <><strong>Whether you ate</strong> — the attendance record created when your pass is scanned at the dining hall, including the time and who scanned it.</>,
        <><strong>What you owe</strong> — your monthly bill, any fines, and the bank reference (UTR) you enter when you tell the office you have paid.</>,
        <><strong>Security records</strong> — your password in hashed form (never the password itself), sign-in sessions, and the IP address a sign-in came from, kept so the service can throttle guessing attacks.</>,
        <><strong>An audit trail</strong> — a log of administrative actions taken on your record, such as issuing a setup code or correcting attendance, and which staff member took them.</>,
      ]} />
      <p>
        A profile photo, if you add one, is stored only in your own browser on that device. It is
        not uploaded and the mess office never receives it.
      </p>
      <p>
        The app does not collect location, contacts, or anything from your device beyond the camera
        while you are actively using the scanner, and it does not track you across other websites.
      </p>
    </Section>

    <Section title="Why it is held, and on what basis">
      <p>
        Everything above exists to provide the mess service you are enrolled in and to bill it
        correctly: planning how much food to cook, recording who ate, calculating each student&rsquo;s
        share of the month&rsquo;s cost, and settling payment. Security and audit records exist to keep
        the service and your account safe, and to allow a billing dispute to be investigated.
      </p>
      <p>
        There is no advertising, no profiling, and nothing here is sold or shared for anyone
        else&rsquo;s commercial purposes.
      </p>
    </Section>

    <Section title="Who can see it">
      <Bullets items={[
        <>You can see your own record.</>,
        <>Mess office staff and the warden can see student records, because running and billing the mess requires it.</>,
        <>A student given committee scanner access can see a name and photo at the moment of scanning, for the duration of that grant, and nothing else.</>,
        <>The hosting and database provider (DigitalOcean) stores the data on the university&rsquo;s behalf in its Bangalore region. It does not use it for anything else.</>,
      ]} />
      <p>
        Nothing is disclosed outside this list unless the university is legally required to, or you
        ask for it.
      </p>
    </Section>

    <Section title="Cookies and similar storage">
      <p>
        The app sets one cookie, which keeps you signed in. It is strictly necessary for the service
        to work and carries no advertising or analytics purpose, which is why you are not asked to
        consent to it &mdash; without it you simply could not stay signed in.
      </p>
      <p>
        Your browser also stores small preferences on your own device, such as the last screen you
        had open and whether you want cutoff reminders. Those never leave your device. Clearing your
        browser data removes them.
      </p>
    </Section>

    <Section title="How long it is kept">
      <p>
        Meal, attendance and billing records are kept for as long as the mess account is open and
        afterwards for as long as the university&rsquo;s own record-keeping rules require, because they
        are the evidence behind money that was charged.
      </p>
      <p>
        Sign-in sessions expire on their own and expired ones are deleted automatically each night.
      </p>
    </Section>

    <Section title="Your rights">
      <p>Under the Digital Personal Data Protection Act, 2023 you may:</p>
      <Bullets items={[
        'ask what the app holds about you and get a copy',
        'have something corrected if it is wrong — your name, date of birth, category or an attendance record',
        'ask for your data to be erased, where it is not needed for billing or required to be kept',
        'complain to the mess office, and then to the Data Protection Board of India if you are not satisfied',
      ]} />
      <p>
        Your name, registration number and membership category come from the mess roll, so
        corrections to those are made by the office rather than in the app.
      </p>
    </Section>

    <Section title="Keeping it safe">
      <p>
        Passwords are stored hashed with Argon2 and are never readable, by staff or by anyone else.
        Traffic is encrypted in transit, the database accepts connections only from the application,
        meal passes are signed and expire in sixty seconds, and administrative actions are logged.
        No system is perfect; if a breach affects you, the mess office will tell you.
      </p>
    </Section>

    <Section title="Changes">
      <p>
        If this notice changes materially, the new version will appear here with a new date, and the
        mess office will let students know.
      </p>
    </Section>
  </>
);

const Terms = () => (
  <>
    <Section title="What this app is">
      <p>
        MessConnect is the CUSAT hostel mess&rsquo;s own tool for planning meals, recording attendance
        and issuing monthly bills. Access is for enrolled students and mess office staff. It is
        provided as part of the hostel mess service, not as a commercial product.
      </p>
      <ContactBlock />
    </Section>

    <Section title="Your account">
      <Bullets items={[
        'Your account is created by the mess office from the hostel roll. You set your own password when you activate it.',
        'The account is yours alone. Do not share your password, and do not let anyone else use your meal pass.',
        'If you think someone else has your password, change it and tell the mess office.',
        'The office can suspend an account that is being misused, and will say why.',
      ]} />
    </Section>

    <Section title="Opting out of meals">
      <Bullets items={[
        <>Opt-outs for the next day close at <strong>9 PM</strong>. After the cutoff the day is fixed, because the kitchen has already bought and prepared for it.</>,
        <>A student may take up to <strong>10 mess cuts in a month</strong>.</>,
        <>A day only counts as a mess cut when all three meals are opted out. Skipping one or two meals still counts as an opted-in day for billing.</>,
      ]} />
    </Section>

    <Section title="Attendance and your pass">
      <p>
        Your pass is a signed code that changes every sixty seconds and can be used once. A
        screenshot will not work. Present it yourself at the dining hall; letting someone else eat
        on your pass is a misuse of the account.
      </p>
      <p>
        If you opted into a meal and did not come, a fine may be recorded, at the rate the mess
        office has set. If an attendance record is wrong, ask the office to correct it.
      </p>
    </Section>

    <Section title="Bills and payment">
      <Bullets items={[
        'The monthly cost of running the mess is shared across every opted-in student-day. Your bill is your share, plus any fines.',
        'A bill becomes visible once the office publishes it. Published bills are kept as issued; a correction is published as a new revision rather than by editing the old one.',
        'After paying, enter the bank reference (UTR) in the app. Staff check it against the bank statement before marking it verified. Entering a reference is not by itself proof of payment.',
        'Questions about an amount go to the mess office.',
      ]} />
    </Section>

    <Section title="Using it fairly">
      <p>
        Do not try to break into other people&rsquo;s records, interfere with the service, or automate
        requests against it. Committee scanner access is granted for a fixed period to take
        attendance, and is for that purpose only.
      </p>
    </Section>

    <Section title="Availability and accuracy">
      <p>
        The mess office aims to keep the app available and correct, but it may be unavailable for
        maintenance or reasons outside its control. If the app is down, the mess still runs and the
        office will fall back to its own records. Where the app and the office&rsquo;s records disagree,
        the office&rsquo;s records decide, after investigation.
      </p>
    </Section>

    <Section title="Changes to these terms">
      <p>
        These terms may be updated; the current version is always the one on this page, with its
        date. Continuing to use the app means the current version applies.
      </p>
    </Section>
  </>
);

export const LegalView: React.FC<{ page: LegalPage }> = ({ page }) => {
  const isPrivacy = page === 'privacy';
  return (
    <main className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="max-w-[760px] mx-auto px-5 py-10 lg:py-14">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-bold mb-6"
          style={{ color: 'var(--orange-dark)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Back to CUSAT MessConnect
        </a>

        <h1 className="font-display text-[28px] font-bold" style={{ color: 'var(--text-dark)' }}>
          {isPrivacy ? 'Privacy Policy' : 'Terms of Use'}
        </h1>
        <p className="text-[13px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>
          CUSAT Hostel Mess &middot; last updated {UPDATED}
        </p>

        {isPrivacy ? <Privacy /> : <Terms />}

        <p className="mt-10 pt-5 text-[13px] font-semibold" style={{ borderTop: '1px solid var(--line)', color: 'var(--text-muted)' }}>
          {isPrivacy
            ? <>See also the <a href="/terms" style={{ color: 'var(--orange-dark)', fontWeight: 800 }}>Terms of Use</a>.</>
            : <>See also the <a href="/privacy" style={{ color: 'var(--orange-dark)', fontWeight: 800 }}>Privacy Policy</a>.</>}
        </p>
      </div>
    </main>
  );
};
