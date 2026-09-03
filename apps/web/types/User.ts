import { UserDemographics } from "./UserDemographics";

export interface User {
    id: string;
    name: string | "null";
    email?: string | null;
    avatar_url: string | null;
    userDemographics?: UserDemographics | null;
}