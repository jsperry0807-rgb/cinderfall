import { Navigate, Route, Routes } from "react-router-dom";
import { AccountPage } from "../pages/AccountPage";
import { ForgotPage } from "../pages/ForgotPage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPage } from "../pages/ResetPage";
import { SignupPage } from "../pages/SignupPage";
import { VerifyPage } from "../pages/VerifyPage";
import { PlayPage } from "../pages/PlayPage";

export function App() {
    return (
        <Routes>
            <Route path="/" element={<PlayPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot" element={<ForgotPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
