import { UserService } from "@/services/UserService";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextProps {
  user: any;
  loading: boolean;
  updateUser: (newUser: any) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  loading: true,
  updateUser: () => { },
  signOut: async () => { },
});



const COUNTDOWN_SECONDS = 5; // Timeout duration

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timer, setTimer] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const sessionUser = await UserService.getUserSession(); // wraps supabase.auth.getSession() or similar
        setUser(sessionUser ?? null);
      } catch (err) {
        console.error("Error fetching user session:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser(); // ⬅️ only once on mount
  }, []);

  // Sign out function
  const signOut = async () => {
    try {
      await UserService.signOutUser()
      setUser(null); // Set the user state to null
      window.location.href = "/"; // Reload the window
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const updateUser = (newUser: any) => {
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
