import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export const RefundPolicyPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/service#refund", { replace: true });
  }, [navigate]);

  return null;
};
