// Koe service worker: shows reminders the person set, nothing else.
self.addEventListener("push", (event) => {
  let data = { title: "Koe", body: "A reminder you set.", url: "/today" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // Keep the neutral default.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      tag: "koe-reminder",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/today";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
