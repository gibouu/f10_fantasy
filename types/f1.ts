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
}

interface Constructor {
    constructorId: string;
    url: string;
    name: string;
    nationality: string;
}

interface Status {
    status: string
}

export interface Result {
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

export interface RacesResults {
    season: string,
    round: string
    Results: Result[]
}

export interface EventData {
    circuit_key: string;
    circuit_short_name: string;
    country_code: string;
    country_key: string;
    country_name: string;
    date_end: string; // ISO 8601 format
    date_start: string; // ISO 8601 format
    gmt_offset: string; // Could also be number if you prefer to parse it
    location: string;
    meeting_key: string;
    session_key: string;
    session_name: string;
    session_type: "Practice" | "Qualifying" | "Race"; // Enum-like if you have a limited set of known session types
    year: number;
}
