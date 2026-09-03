import Image from "next/image";
import AuthForm from "@/components/forms/AuthForm";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export const Header = () => {
  const { user, signOut } = useAuth();
  
  return (
    <div className="navbar bg-main-4 border-b border-gray-300">
      <div className="flex-1">
        <Link className="btn btn-ghost text-colortext-1 font-semibold text-xl" href="/">
          SmartVoyage
        </Link>
      </div>
      <div className="flex-none gap-2">
        {/* Conditionally render login button or avatar */}
        {!user ? (
          // If user is not authenticated, show a login button
          <AuthForm />
        ) : (
          // If user is authenticated, show avatar with dropdown options
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar"
            >
              <div className="w-10 rounded-full">
                {user?.avatar_url ? (
                  <Image
                    src={user?.avatar_url}
                    alt="User Avatar"
                    className="w-10 rounded-full"
                    width={10}
                    height={10}
                    quality={100}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                    {user ? user.name : "U"}
                  </div>
                )}
              </div>
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-main-2 rounded-box z-[1] mt-3 w-52 p-2 shadow"
            >
              <li>
                <Link id='profile' href={`/profile/${user.id}`} className="text-gray-700 hover:text-black active:text-black focus:text-black">Profile</Link>
              </li>
              <li>
                <a onClick={signOut} className="text-gray-700 hover:text-black active:text-black focus:text-black">Logout</a>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
