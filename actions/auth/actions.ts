// src/actions/auth/action.ts
import { STAFF_MEMBERS } from "@/lib/dummy-data";

//Handle User Login
export const loginUser = async (email: string, password: string) => {
  // Simulate network delay for frontend feel
  await new Promise((resolve) => setTimeout(resolve, 1000));

    // BACKEND INTEGRATION POINT: POST LOGIN
    // Uncomment or change the logic below to integrate with backend API.
     /*
     const response = await fetch("https://api.digivax.ph/v1/auth/login", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ email, password }),
     });
     
     const data = await response.json();
     
     if (!response.ok) {
       throw new Error(data.message || "Invalid credentials");
     }
     
     return data.user; 
    */

  // SIMULATED LOGIC (CURRENT)
  const user = STAFF_MEMBERS.find(u => u.email === email && password === "1234");

  if (!user) {
    throw new Error("Invalid credentials. Use '1234' for testing.");
  }

  if (user.status === "Disabled") {
    throw new Error("Access Denied: This account is disabled.");
  }

  return user;
};

// Handle Password Reset / Force Change
 
export const updatePassword = async (email: string, newPassword: string) => {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1200));
    
  // BACKEND INTEGRATION: PATCH PASSWORD
  // Uncomment or change the logic below to integrate with backend API.
    /*
     const response = await fetch("https://api.digivax.ph/v1/auth/reset-password", {
       method: "PATCH",
       headers: { 
         "Content-Type": "application/json",
         // "Authorization": `Bearer ${token}` // Usually required for sensitive actions
       },
       body: JSON.stringify({ email, newPassword, forcePasswordChange: false }) // Adjust payload as needed,
     });

     if (!response.ok) {
       const data = await response.json();
       throw new Error(data.message || "Failed to update password");
     }

     return await response.json();
    */

  // SIMULATED LOGIC (CURRENT)
  console.log(`Simulated password update for: ${email}. forcePasswordChange set to false.`);
  return { 
    success: true,
    message: "Password updated successfully." 
  };
};