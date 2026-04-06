const APP_URL = process.env.APP_URL
const CRON_SECRET = process.env.CRON_SECRET

async function callCronEndpoint(job) {
  const url = `${APP_URL}/api/cron/${job}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
  })

  const body = await response.text()

  if (!response.ok) {
    throw new Error(`${job} failed: HTTP ${response.status} — ${body}`)
  }

  console.log(`[${job}] OK:`, body)
}

export const handler = async (event) => {
  const job = event?.job ?? event?.detail?.job

  if (!job) {
    throw new Error('No job specified in event payload')
  }

  console.log(`Running cron job: ${job}`)
  await callCronEndpoint(job)

  return { statusCode: 200, job }
}
