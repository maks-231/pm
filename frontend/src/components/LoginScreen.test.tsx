import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginScreen } from "@/components/LoginScreen";
import * as api from "@/lib/api";

describe("LoginScreen", () => {
  it("calls onSuccess with the username after a successful login", async () => {
    vi.spyOn(api, "login").mockResolvedValue({ username: "user" });
    const onSuccess = vi.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(api.login).toHaveBeenCalledWith("user", "password");
    expect(onSuccess).toHaveBeenCalledWith("user");
  });

  it("shows an error and does not call onSuccess on failed login", async () => {
    vi.spyOn(api, "login").mockRejectedValue(new Error("unauthorized"));
    const onSuccess = vi.fn();
    render(<LoginScreen onSuccess={onSuccess} />);

    await userEvent.type(screen.getByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /incorrect username or password/i
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
