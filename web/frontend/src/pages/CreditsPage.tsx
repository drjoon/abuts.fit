import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const CreditsPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/service#credits", { replace: true });
  }, [navigate]);

  return null;
};
