// authNav.js
//
// index.html, about.html, gallery.html, and menu.html don't have their own
// Firebase auth listener (unlike account.html/order.html/my-orders.html),
// so their "Sign In" nav link never updated even when you were still
// signed in. This file fixes that - drop it in next to firebase-init.js
// and load it as a module on every page (see snippet below).
//
// It also drives the "Sign Out" nav item, which previously didn't exist
// anywhere in the main site nav — signing out required navigating into
// account.html and finding the button in the logged-in card.

import { auth, onAuthStateChanged, signOut } from "./firebase-init.js";

onAuthStateChanged(auth, (user) => {
  const link = document.getElementById("navAccountLink");
  const signOutItem = document.getElementById("navSignOutItem");
  if (!link) return;

  if (user) {
    const label = user.displayName || user.email || "My Account";
    link.textContent = label.split(" ")[0].split("@")[0];
    link.href = "account.html";
    if (signOutItem) signOutItem.style.display = "";
  } else {
    link.textContent = "Sign In";
    link.href = "account.html";
    if (signOutItem) signOutItem.style.display = "none";
  }

  // Only reveal the link once we actually know the auth state - this is
  // what stops the "Sign In" -> "Cyrus" flash on page load. The link
  // starts hidden via inline style in the HTML (visibility:hidden).
  link.style.visibility = "visible";
});

const signOutLink = document.getElementById("navSignOutLink");
if (signOutLink) {
  signOutLink.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.reload();
  });
}