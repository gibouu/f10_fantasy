interface Circuit {
    circuitId: string;
    url: string;
    name: string;
    location: string;
}

export interface RaceEvent {
    season: string;
    round: string;
    url: string;
    raceName: string;
    Circuit: Circuit;
    date: string;
    time: string;
    openF1RaceKey: string | undefined;
    openF1QualifyingKey: string | undefined;
    meeting_key: string;
    Qualifying: { date: string; time: string };
}

export interface RaceEventOpenF1 {
    year: string;
    session_key: string;
    session_type: string;
    meeting_key: string;
    date_start: string;
    date_end: string;
}

export interface Driver {
    driverId: string;
    permanentNumber: string;
    code: string;
    url: string;
    givenName: string;
    familyName: string;
    dateOfBirth: string;
    nationality: string;
    driver_number: string,
    first_name: string,
    full_name: string,
    headshot_url: string,
    last_name: string,
    meeting_key: string,
    session_key: string,
    team_colour: string,
    team_name: string
}

interface Constructor {
    constructorId: string;
    url: string;
    name: string;
    nationality: string;
}

interface Status {
    status: string;
}

export interface RaceResultsErgast {
    number: string;
    position: string;
    positionText: string;
    points: string;
    Driver: Driver;
    Constructor: Constructor;
    grid: string;
    laps: string;
    status: Status;
}

export interface RacesResultsErgast {
    season: string;
    round: string;
    Results: RaceResultsErgast[];
}

export interface RaceResultsOpenF1 {
    driver_number: string;
    position: string;
    driverFullName: string;
    date: string;
}

export interface RacesResultsOpenF1 {
    year: string;
    session_key: string;
    session_type: string;
    date_start: string;
    date_end: string;
    gmt_offset: string;
    results: RaceResultsOpenF1[];
}

export type SessionStatus = "active" | "inactive";

export interface QualifyingResultOpenF1 {
    driver_number: string;
    position: string;
    driverFullName: string;
    date: string;
}
