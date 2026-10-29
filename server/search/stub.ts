import "server-only";

// Explicit local fixture only; hosted APP_URL values cannot activate it.
export const searchStubbed = () =>
  process.env.KOE_SEARCH_STUB === "on" &&
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(
    process.env.APP_URL ?? "",
  );

/** A fixed video fixture: its oEmbed is answered locally in stub mode. */
export const stubVideo = {
  id: "stubVideo01",
  authorUrl: "https://www.youtube.com/@NHS",
  authorName: "NHS",
};

export const stubSearchHits = (includeDomains?: string[], query?: string) => {
  if (includeDomains?.includes("youtube.com")) {
    return [
      {
        title: "Low mood: ideas for adults",
        url: `https://www.youtube.com/watch?v=${stubVideo.id}`,
        content:
          "A short video for adults about ordinary ways to make everyday life with low mood more manageable at your own pace.",
        score: 1,
      },
    ];
  }
  const q = (query ?? "").toLowerCase();
  const isShelfTagQuery = q.includes("practical self-help guide for adults");
  if (!isShelfTagQuery && q) {
    if (/\b(tutor\w*|math\w*|algebra|exam|study|academic|course)\b/.test(q)) {
      return [
        {
          title: "One-to-one tutoring and study support for adults",
          url: "https://www.khanacademy.org/about",
          content:
            "Find structured study support, subject tutoring and guided practice for adult learners preparing for exams or coursework at their own pace.",
          score: 1,
        },
        {
          title: "Adult learning and skills advice service",
          url: "https://nationalcareers.service.gov.uk/explore-your-education-and-training-choices",
          content:
            "Book a session with an education and skills adviser to find local or online tutoring, courses and study support.",
          score: 0.95,
        },
      ];
    }
    if (/\b(debt|money|financial|budget|citizens advice)\b/.test(q)) {
      return [
        {
          title: "Get free confidential debt and money advice",
          url: "https://www.citizensadvice.org.uk/debt-and-money/",
          content:
            "Speak with a trained adviser online, by phone or in person for practical help sorting out bills, budgeting and money worries.",
          score: 1,
        },
        {
          title: "Free debt advice and support online or by phone",
          url: "https://www.stepchange.org/how-we-help/debt-advice.aspx",
          content:
            "Get tailored, confidential support from a specialist debt adviser to work through bills, repayments and a realistic budget.",
          score: 0.96,
        },
      ];
    }
    if (/\b(career|cv|resume|employment|job)\b/.test(q)) {
      return [
        {
          title: "Book a career and CV advice appointment",
          url: "https://nationalcareers.service.gov.uk/contact-us",
          content:
            "Free one-to-one support from a qualified careers adviser to help with CV updates, job applications and work decisions.",
          score: 1,
        },
      ];
    }
    if (/\b(sleep|insomnia)\b/.test(q)) {
      return [
        {
          title: "NHS talking therapies and sleep support services",
          url: "https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/nhs-talking-therapies/",
          content:
            "Refer yourself directly to an NHS talking therapies service or speak with a GP for structured support with sleep and low mood.",
          score: 1,
        },
        {
          title: "Finding professional help for insomnia and sleep problems",
          url: "https://www.sleepfoundation.org/insomnia/treatment",
          content:
            "Learn how cognitive behavioral therapy for insomnia (CBT-I) and sleep specialists help adults rebuild steadier sleep.",
          score: 0.94,
        },
      ];
    }
    if (/\b(gp|doctor|therap\w*|counsell\w*|appointment|referral)\b/.test(q)) {
      return [
        {
          title: "Find an NHS talking therapies service",
          url: "https://www.nhs.uk/service-search/mental-health/find-an-nhs-talking-therapies-service/",
          content:
            "Search for an accredited talking therapies service in your area that you can refer yourself to without seeing a GP first.",
          score: 1,
        },
        {
          title: "How to find a therapist or counsellor",
          url: "https://www.mind.org.uk/information-support/drugs-and-treatments/talking-therapy-and-counselling/how-to-find-a-therapist/",
          content:
            "Practical guidance for adults on booking a GP appointment, using self-referral services, or finding an accredited counsellor.",
          score: 0.92,
        },
      ];
    }
  }
  return [
    {
      title: "Ideas for low mood",
      url: "https://www.nhs.uk/mental-health/self-help/low-mood/",
      content:
        "Small practical ideas for adults finding everyday life difficult with low mood. Explore ordinary ways to make daily life more manageable at your own pace.",
      score: 1,
    },
    {
      title: "Looking after yourself",
      url: "https://www.mind.org.uk/information-support/low-mood/",
      content:
        "A guide for adults to looking after yourself when your mood is low. Read about small changes and ways to choose what feels manageable for your day.",
      score: 0.9,
    },
    {
      title: "Finding enjoyable moments",
      url: "https://www.helpguide.org/mental-health/wellbeing/enjoyable-moments",
      content:
        "Ideas for adults who want to reconnect with things they once enjoyed. You can read about finding a little time for music, making things or other interests.",
      score: 0.8,
    },
  ];
};
