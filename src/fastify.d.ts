import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    apiClientId?: string;
    idempotencyKey?: string;
    startedAtNs?: bigint;
    appErrorCode?: string;
  }
}
