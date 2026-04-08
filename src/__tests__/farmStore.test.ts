import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test Zustand store logic for notification management.
 * We test the pure logic without React hooks.
 */

interface AppNotification {
  id: string;
  type: "weather" | "harvest" | "risk" | "task" | "info";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

// Simulate the store's notification logic
function createNotificationManager() {
  let notifications: AppNotification[] = [];

  return {
    getNotifications: () => notifications,
    addNotification: (n: Omit<AppNotification, "id" | "read" | "created_at">) => {
      notifications = [
        {
          ...n,
          id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          read: false,
          created_at: new Date().toISOString(),
        },
        ...notifications,
      ];
    },
    markRead: (id: string) => {
      notifications = notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
    },
    clearAll: () => {
      notifications = [];
    },
    getUnreadCount: () => notifications.filter((n) => !n.read).length,
  };
}

describe("Notification Manager", () => {
  let manager: ReturnType<typeof createNotificationManager>;

  beforeEach(() => {
    manager = createNotificationManager();
  });

  it("starts empty", () => {
    expect(manager.getNotifications()).toHaveLength(0);
    expect(manager.getUnreadCount()).toBe(0);
  });

  it("adds notifications", () => {
    manager.addNotification({
      type: "weather",
      title: "Storm Alert",
      message: "Thunderstorm incoming",
    });

    expect(manager.getNotifications()).toHaveLength(1);
    expect(manager.getNotifications()[0].title).toBe("Storm Alert");
    expect(manager.getNotifications()[0].read).toBe(false);
  });

  it("prepends new notifications (newest first)", () => {
    manager.addNotification({
      type: "weather",
      title: "First",
      message: "First alert",
    });
    manager.addNotification({
      type: "risk",
      title: "Second",
      message: "Second alert",
    });

    expect(manager.getNotifications()[0].title).toBe("Second");
    expect(manager.getNotifications()[1].title).toBe("First");
  });

  it("marks notifications as read", () => {
    manager.addNotification({
      type: "harvest",
      title: "Harvest Ready",
      message: "Plot A1 ready",
    });

    const id = manager.getNotifications()[0].id;
    expect(manager.getUnreadCount()).toBe(1);

    manager.markRead(id);
    expect(manager.getUnreadCount()).toBe(0);
    expect(manager.getNotifications()[0].read).toBe(true);
  });

  it("clears all notifications", () => {
    manager.addNotification({ type: "task", title: "T1", message: "m1" });
    manager.addNotification({ type: "task", title: "T2", message: "m2" });

    expect(manager.getNotifications()).toHaveLength(2);
    manager.clearAll();
    expect(manager.getNotifications()).toHaveLength(0);
  });

  it("counts unread correctly with mixed read states", () => {
    manager.addNotification({ type: "weather", title: "A", message: "a" });
    manager.addNotification({ type: "risk", title: "B", message: "b" });
    manager.addNotification({ type: "harvest", title: "C", message: "c" });

    const id = manager.getNotifications()[1].id;
    manager.markRead(id);

    expect(manager.getUnreadCount()).toBe(2);
  });
});
