import { supabase } from "@/lib/supabase/client";
import { User } from "@/types/User";
import { UserDemographics } from "@/types/UserDemographics";

export class UserService {
    private static readonly USERS_TABLE = "users";
    private static readonly USERS_DEMOGRAPHICS_TABLE = "users_demographics";

    static async getUserSession(): Promise<User | null> {

        // During Cypress tests, return a fake user
        // If you want to test with a real user, change the id, email, name and avatar_url to your own values in Supabase
        if (process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === "true") {
            return {
                id: "1b9472e1-a85e-43bf-9898-6f44e2b20809",
                email: "testuser@example.com",
                name: "Test User",
                avatar_url: "",
            };
        }

        const session = await supabase.auth.getUser();
        if (session.data.user) {
            // Destruct properties from nested obj
            const { user_metadata, email, id } = session.data.user;
            const { name, avatar_url } = user_metadata;
            const user: User = {
                id: id,
                email: email,
                name: name,
                avatar_url: avatar_url
            }
            return user
        }
        return null;
    }

    static async checkUserExists(id: string): Promise<boolean> {
        const { error, count } = await supabase
            .from(this.USERS_TABLE)
            .select("*", { count: 'exact', head: true }) // Select all (for count), but only fetch head
            .eq("id", id);

        if (error) {
            console.error("Error checking user existence:", error);
            return false;
        }

        return count !== null && count > 0;
    }

    static async getUserById(id: string): Promise<User | null> {
        try {
            const { data } = await supabase
                .from(this.USERS_TABLE)
                .select(`
              *,
              users_demographics (
                user_id,
                min_budget,
                max_budget,
                travel_type,
                purpose,
                number_of_people
              )
            `).eq("id", id).single();
            if (data) {
                const userDemographicsData: UserDemographics = {
                    id: data.users_demographics?.id,
                    userId: data.users_demographics?.user_id,
                    minBudget: data.users_demographics?.min_budget,
                    maxBudget: data.users_demographics?.max_budget,
                    travelType: data.users_demographics?.travel_type,
                    purpose: data.users_demographics?.purpose,
                    numberOfPeople: data.users_demographics?.number_of_people,
                }
                const userData: User = {
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    avatar_url: data.avatar_url,
                    userDemographics: userDemographicsData
                }
                return userData;
            }
            return null;
        } catch (error) {
            console.error("Error getting user by id:", error);
            return null;
        }
    }

    static async createUser(user: User): Promise<void> {
        console.log("Creating user:", user);
        const { error: insertError } = await supabase
            .from(this.USERS_TABLE)
            .insert([user]);
        if (insertError) {
            console.error("Error inserting user", insertError);
        }
    }

    static async updateUserDemographics(userDemographics: UserDemographics): Promise<void> {
        try {
            const { error: updateError } = await supabase
                .from(this.USERS_DEMOGRAPHICS_TABLE)
                .upsert({ //Update if exists else insert
                    user_id: userDemographics.userId,
                    min_budget: userDemographics.minBudget,
                    max_budget: userDemographics.maxBudget,
                    travel_type: userDemographics.travelType,
                    purpose: userDemographics.purpose,
                    number_of_people: userDemographics.numberOfPeople,
                }, { onConflict: 'user_id' })

            if (updateError) {
                console.error("Error updating user demographics", updateError);
            }

        } catch (error) {
            console.error("Error updating user demographics", error);
        }
    }

    static async getUserDemographicsById(id: string): Promise<UserDemographics | null> {
        try {
            const { data } = await supabase
                .from(this.USERS_DEMOGRAPHICS_TABLE)
                .select("*")
                .eq("user_id", id)
                .single();
            if (data) {
                const userDemographics: UserDemographics = {
                    id: data.id,
                    userId: data.user_id,
                    minBudget: data.min_budget,
                    maxBudget: data.max_budget,
                    travelType: data.travel_type,
                    purpose: data.purpose,
                    numberOfPeople: data.number_of_people
                }
                return userDemographics
            }
            return null;
        } catch (error) {
            console.error("Error getting user demographics:", error);
            return null;
        }
    }

    static async signOutUser() {
        await supabase.auth.signOut();
    }
}