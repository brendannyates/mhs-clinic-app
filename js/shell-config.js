// Shell settings. This file is public. It holds the one link the shell needs to find the clinic folders:
// the "People in MHS" share link to /Clinic Apps/index.json. No patient data, no flow URLs, no secrets.
self.SHELL = {
  indexUrl: '',
  pollMs: 60000, // outputs refresh (open question: confirm 60 s is acceptable load)
};
