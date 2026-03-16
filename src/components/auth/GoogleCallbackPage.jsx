import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { setAuth, fetchMe } from "../api/auth.js";
import { Activity } from "lucide-react";

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("Authentication failed. No token provided.");
      setTimeout(() => navigate("/"), 4000);
      return;
    }

    // Set the token first so that fetchMe can use it for authentication
    setAuth({ token });

    const completeAuth = async () => {
      try {
        const user = await fetchMe();
        // Now set the full auth object with user details
        setAuth({ token, ...user });
        // Navigate to home, App.jsx will handle showing the correct portal
        window.location.href = "/";
      } catch (err) {
        setError(`Authentication failed: ${err.message}. Redirecting to login...`);
        setTimeout(() => navigate("/"), 4000);
      }
    };

    completeAuth();
  }, [searchParams, navigate]);

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <div className="flex items-center gap-3 text-lg font-semibold">
        <Activity className="animate-spin text-[rgb(var(--primary))]" size={24} />
        <p>Completing authentication, please wait...</p>
      </div>
      {error && (
        <div className="mt-4 text-red-500 bg-red-500/10 border border-red-500/20 rounded-md px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
