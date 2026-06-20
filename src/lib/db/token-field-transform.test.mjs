import assert from "node:assert/strict"
import test from "node:test"

import { transformTokenFields } from "./token-field-transform.js"

const encrypt = (value) => `enc(${value})`

test("transformTokenFields encrypts token string filter objects", () => {
  const transformed = transformTokenFields(
    {
      where: {
        OR: [
          { access_token: "direct-access" },
          {
            access_token: {
              equals: "access-1",
              in: ["access-2", "access-3"],
              notIn: ["access-4"],
              not: { equals: "access-5" },
              mode: "insensitive",
            },
          },
        ],
        refresh_token: { not: "refresh-1" },
        id_token: { set: "id-1" },
      },
    },
    encrypt,
  )

  assert.deepEqual(transformed, {
    where: {
      OR: [
        { access_token: "enc(direct-access)" },
        {
          access_token: {
            equals: "enc(access-1)",
            in: ["enc(access-2)", "enc(access-3)"],
            notIn: ["enc(access-4)"],
            not: { equals: "enc(access-5)" },
            mode: "insensitive",
          },
        },
      ],
      refresh_token: { not: "enc(refresh-1)" },
      id_token: { set: "enc(id-1)" },
    },
  })
})
