import { component$, useStore } from "@builder.io/qwik";
import {
  Link,
  routeAction$,
  routeLoader$,
  type DocumentHead,
} from "@builder.io/qwik-city";
import { TbArrowNarrowRight } from "@qwikest/icons/tablericons";
import { isValidHandle } from "@atproto/syntax";

import { D1Orm } from "d1-orm";
import { UserModel } from "~/modles";
import { HandleResolver } from "../lib/handle-resolver";

import { monotonicFactory } from "ulidx";
const ulid = monotonicFactory();

export const useGetPageData = routeLoader$(async ({ url, platform }) => {
  const orm = new D1Orm(platform.env.DB);
  const users = await UserModel(orm).All({});
  return {
    url: {
      host: url.host,
    },
    users: users.results.length,
  };
});

export const useCheckUsername = routeAction$(async (data) => {
  const username = data.username.toString().toLowerCase();
  const hdlres = new HandleResolver({});
  try {
    const did = await hdlres.resolve(username);

    return { did: did };
  } catch (error) {
    console.error(error);
    return { error: "Failed to resolve username" };
  }
});

export const useCreateUser = routeAction$(async (data, { platform }) => {
  const orm = new D1Orm(platform.env.DB);
  const User = UserModel(orm);
  const handle = data.handle.toString();
  const did = data.did.toString();

  const existingUser = await User.First({
    where: { handle: handle },
  });
  if (existingUser) {
    return { error: "Username already exists" };
  }

  const newUser = await User.InsertOne({
    id: ulid(),
    handle: handle.toLowerCase(),
    did: did,
  });
  return newUser;
});

export default component$(() => {
  const state = useStore({
    step: 1,
    currentUsername: "",
    newUsername: "",
    userDid: "",
    usernameExists: null as null | boolean, // null = not checked, true = exists, false = doesn't exist
    loading: false,
    errorCheckUsername: null as null | string,
    errorNewUsername: null as null | string,
    success: false, // Track when the form is successfully submitted
    rateLimitExceeded: false,
  });

  const pageData = useGetPageData();
  const checkProfileAction = useCheckUsername();
  const createUserAction = useCreateUser();

  const hostDomain =
    pageData.value.url.host === "localhost:5173"
      ? "simple.handles"
      : pageData.value.url.host;

  return (
    <div class="flex h-screen items-center justify-center bg-gradient-to-tr from-purple-200 to-blue-200">
      <section class="mx-auto flex min-h-[400px] max-w-md items-center justify-center rounded-lg bg-gradient-to-r from-blue-50 to-purple-100 p-8 shadow-xl duration-1000 animate-in fade-in">
        {!state.success ? (
          /* Form */
          <div class="w-full space-y-8 duration-500 ease-in-out animate-in">
            {/* Header */}
            <div class="w-full space-y-4">
              <h1 class="text-center text-3xl font-bold text-gray-800">
                {hostDomain}
              </h1>
              <p class="text-center text-lg text-gray-500">
                Join{" "}
                <Link
                  href="/community"
                  class="text-fuchsia-400 underline underline-offset-4 transition duration-300 ease-in-out hover:text-fuchsia-600"
                >
                  <strong>{pageData.value.users}</strong>
                </Link>{" "}
                users already using {hostDomain} as their handle on Bluesky!
              </p>
            </div>
            {/* Step 1: Enter current username */}
            <div
              class={`mb-4 animate-in fade-in ${state.step >= 1 ? "opacity-100" : "opacity-50"} ${state.step === 1 ? "" : "pointer-events-none"}`}
            >
              <label
                class={`mb-2 block text-sm font-medium ${state.step === 1 ? "text-gray-800" : "text-gray-400"}`}
              >
                Current Username
              </label>
              <input
                type="text"
                class={`w-full rounded-lg border border-gray-300 px-4 py-3 ${state.step === 1 ? "text-gray-700" : "text-gray-400"} shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400`}
                value={state.currentUsername}
                onInput$={(e) =>
                  (state.currentUsername = (e.target as HTMLInputElement).value)
                }
                disabled={state.loading}
                placeholder="username.bsky.social"
              />
              <button
                class={`mt-4 w-full min-w-32 rounded-lg px-5 py-3 text-lg font-semibold shadow-md transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed 
                ${state.step === 1 && state.currentUsername.length >= 1 ? "bg-blue-600 text-white hover:bg-blue-700" : "pointer-events-none bg-gray-300 text-gray-400"}`}
                onClick$={async () => {
                  state.loading = true;
                  state.errorCheckUsername = null; // Reset error
                  const response = await checkProfileAction.submit({
                    username: state.currentUsername.toLowerCase(),
                  });
                  state.loading = false;
                  if (response.value.error) {
                    state.usernameExists = false;
                    state.errorCheckUsername = state.errorCheckUsername =
                      response.value.error || "An unknown error occurred"; // Ensure error message
                  } else if (response.value.did) {
                    state.usernameExists = true;
                    state.step = 2;
                    state.userDid = response.value.did;
                  } else {
                    state.usernameExists = false;
                    state.errorCheckUsername = "Failed to resolve username"; // Fallback error message
                  }
                }}
                disabled={!state.currentUsername || state.loading}
              >
                {state.loading ? "Checking..." : "Next"}
              </button>
              {state.errorCheckUsername && (
                <p class="mt-2 text-sm text-red-500">
                  {state.errorCheckUsername}
                </p>
              )}
            </div>
            {/* Step 2: Enter new username */}
            <div
              class={`mb-4 ${state.step >= 2 ? "opacity-100" : "opacity-50"} ${state.step >= 1 ? "" : "pointer-events-none"}`}
            >
              <label class="mb-2 block text-sm font-medium text-gray-800">
                New Username
              </label>
              <div class="relative w-full">
                <input
                  type="text"
                  class="w-full rounded-lg border border-gray-300 px-4 py-3 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={state.newUsername}
                  onInput$={(e) => {
                    const inputValue = (e.target as HTMLInputElement).value;
                    const sanitizedInput = inputValue
                      .replace(`.${hostDomain}`, "")
                      .toLowerCase();
                    state.newUsername = sanitizedInput;
                  }}
                  disabled={state.step !== 2 || state.loading}
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 transform text-gray-500">{`.${hostDomain}`}</span>
              </div>
            </div>
            {/* Step 3: Submit button */}
            <div
              class={`transition-opacity duration-300 ease-in-out ${state.step >= 2 ? "opacity-100" : "opacity-50"} ${state.step >= 2 ? "" : "pointer-events-none"}`}
            >
              <button
                class="w-full rounded-lg bg-green-600 px-5 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                onClick$={async () => {
                  state.loading = true;
                  state.errorNewUsername = null;
                  const newUsername =
                    state.newUsername.toLowerCase() + `.${hostDomain}`;

                  if (!isValidHandle(newUsername)) {
                    console.log(newUsername);
                    state.errorNewUsername = "Input is not a valid handle";
                    state.loading = false;
                  } else {
                    console.log(newUsername);
                    const response = await createUserAction.submit({
                      handle: state.newUsername,
                      did: state.userDid,
                    });
                    state.loading = false;

                    if (response.value.success) {
                      state.success = true; // Success state
                    } else {
                      state.success = false;
                      state.errorNewUsername = response.value.error;
                    }
                  }
                }}
                disabled={!state.newUsername || state.loading}
              >
                Submit
              </button>
              {state.errorNewUsername && (
                <p class="mt-2 text-sm text-red-500">
                  {state.errorNewUsername}
                </p>
              )}
            </div>
            {/* Credits */}
            <div class="mt-4 text-center text-xs text-gray-500">
              <p>
                Made by{" "}
                <a
                  href="https://github.com/furSUDO/simple-atproto-handles"
                  target="_blank"
                  class="animate underline underline-offset-2 duration-200 hover:text-fuchsia-600"
                >
                  SUDO
                </a>{" "}
                with 💖
              </p>
            </div>
          </div>
        ) : (
          /* Step 4: Success message */
          <div class="space-y-4 text-center">
            <h2 class="text-4xl font-semibold text-green-600">Success!</h2>
            <p class="mt-2 text-lg text-gray-800">
              Your new username has been created. You can now go to Settings
              <span class="inline-flex items-center px-0.5 align-text-bottom text-2xl">
                <TbArrowNarrowRight />
              </span>
              Advanced
              <span class="inline-flex items-center px-0.5 align-text-bottom text-2xl">
                <TbArrowNarrowRight />
              </span>
              Change my handle. Select "I have my own domain" and enter your new
              handle. Finally, tap "Verify DNS Record".
            </p>
            <a
              href="https://bsky.app/settings"
              target="_blank"
              class="inline-block rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Go to Bluesky Settings
            </a>
          </div>
        )}
      </section>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const pageData = resolveValue(useGetPageData);
  return {
    title: `${pageData.url.host} handles`,
    meta: [
      {
        name: "description",
        content: `Join ${pageData.users} people in claiming a ${pageData.url.host} handle for Bluesky!`,
      },
    ],
  };
};