// Team accounts for the web app. Only salted PBKDF2-SHA256 hashes live here, never passwords.
// Add someone: node hermes/add-user.mjs <username> "<name>" <admin|member>, then paste the printed line.
// admin: everything a member has, plus seeing the team list. member: chat with all of Hermes' AI tools.
// locks: abilities this person cannot use (see ABILITIES in worker.mjs). The owner (Telegram /app) has none.
// Each account has its own private chat memory. Nobody here can change the system's structure.
export const USERS = {
  pouria: { name: "پوریا", role: 'admin', locks: ['viking'], salt: 'aa2930fba861208c3e22284f41cf53c5', hash: '521770f9b011446e0e8daaf75352cbff526668916ccb5265c9e76081217a8d09' },
  hesam: { name: "حسام", role: 'member', locks: ['fjcod'], salt: 'de72216e8e10e7b78683ec98be463a7c', hash: '239a55431e672a31398225e75e78f1bac61b8648eaba1973f75cc49d8b368485' },
  mahyar: { name: "مهیار", role: 'member', locks: ['fjcod'], salt: '428d056042ce74b4a13740a79d67411c', hash: '5ea38468fec0151d2e664ac3e8f278ca81d0a3517abec2cd3328fff58a8b49da' },
  rozhan: { name: "روژان", role: 'member', locks: ['fjcod'], salt: 'b0ae0ecc7a2019d80e71929a1bf307c0', hash: 'f3dc80ab173f28d08d1ea49435d3fe359596bcade3ea00e767820d95fb89f0da' },
  amin: { name: "امین", role: 'member', locks: ['fjcod'], salt: '76a0c069b7b10a43c1ddfb44bf5f8442', hash: '91e0d6c7953ffe07c419bc4942c00ce34062dc1af90263fbf105a2a1c0f50635' },
};
