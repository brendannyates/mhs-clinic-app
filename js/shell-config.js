// Shell settings. This file is public.
// The two flow URLs are public on purpose: OneDrive can't be read from this site, so there is nowhere private to fetch them
// from before sign-in. They are not the lock. The Auth flow only sends codes to people on tblAppUsers, to their own Teams;
// the Read flow answers only with a valid session token, and re-checks the person's clinic access on every call.
// If a URL is ever abused (code spam, run quota), regenerate it in the flow and update it here.
self.SHELL = {
  authUrl: '',            // "Clinic App · Auth" trigger URL (When an HTTP request is received)
  readUrl: '',            // "Clinic App · Read" trigger URL
  emailDomain: 'mymhs.com', // appended when someone types just their username
  pollMs: 300000,         // readiness refresh: 5 min keeps the Read flow inside the daily request allowance
};
