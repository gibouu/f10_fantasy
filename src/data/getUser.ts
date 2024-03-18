import getSupabaseClient from "@/db/supabaseClient";

export default async function getUser() {
  const { supabase, session } = await getSupabaseClient();

  const email = session?.user?.email;

  // Check if the email exists and is a string; if not, throw an error.
  if (typeof email !== "string") {
    throw new Error("Email is not available. Please ensure you are logged in.");
  }

  // If the email is available and confirmed to be a string, proceed with the database operation.
  const { data, error: userFetchError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)

  // Proceed with your logic, for example, handling errors or working with the fetched data.
  if (userFetchError) {
    // Optionally, throw an error or handle it as needed
    throw userFetchError;
  }

  const user = data[0]

  return user
}
