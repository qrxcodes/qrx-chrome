import type { Account, AuthStatus, Code, CreateCodeRequest, Job, List, ProblemInfo, Style } from './types';

/** Requests the popup and options page send to the service worker, and what each answers. */
export type Requests = {
  'auth/status': { req: object; res: AuthStatus };
  'auth/signIn': { req: object; res: AuthStatus };
  'auth/signOut': { req: object; res: AuthStatus };
  'auth/apiKey': { req: { apiKey: string }; res: AuthStatus };
  'auth/redirectUri': { req: object; res: string };
  'account/get': { req: object; res: Account };
  'styles/list': { req: object; res: Style[] };
  'codes/list': { req: { cursor?: string }; res: List<Code> };
  'codes/get': { req: { id: string }; res: Code };
  'jobs/create': { req: { request: CreateCodeRequest }; res: Job };
  'jobs/retry': { req: { id: string }; res: Job | undefined };
  'jobs/dismiss': { req: { id: string }; res: void };
  'jobs/seen': { req: { id: string }; res: void };
};

export type RequestType = keyof Requests;

export type Message<T extends RequestType = RequestType> = { type: T } & Requests[T]['req'];

export type Reply<T extends RequestType = RequestType> =
  { ok: true; value: Requests[T]['res'] } | { ok: false; problem: ProblemInfo };

export class MessageError extends Error {
  constructor(readonly problem: ProblemInfo) {
    super(problem.detail || problem.title);
  }
}

/** Sends a request to the service worker; throws MessageError with the worker's problem when it fails. */
export async function send<T extends RequestType>(
  type: T,
  ...args: object extends Requests[T]['req'] ? [Requests[T]['req']?] : [Requests[T]['req']]
): Promise<Requests[T]['res']> {
  const reply = (await chrome.runtime.sendMessage({ type, ...(args[0] ?? {}) })) as Reply<T> | undefined;
  if (!reply) throw new MessageError({ type: 'unknown', title: 'No answer', detail: 'Try again.' });
  if (!reply.ok) throw new MessageError(reply.problem);
  return reply.value;
}
