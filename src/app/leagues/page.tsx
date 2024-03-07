import LeagueForm from "@/components/LeagueForm";

export default function League() {

  const defaultValues = {
    leaguename: "",
  };

  return (
    <div>
      <div>Leagues</div>
      <LeagueForm
        defaultValues={defaultValues} />
    </div>
  );
}