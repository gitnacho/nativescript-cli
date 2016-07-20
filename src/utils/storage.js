import localStorage from 'local-storage';
const userCollectionName = process.env.KINVEY_USER_COLLECTION_NAME || 'kinvey_user';

// Get the active user
export function getActiveUser(client) {
  return localStorage.get(`${client.appKey}${userCollectionName}`);
}

// Set the active user
export function setActiveUser(client, data) {
  if (data) {
    try {
      return localStorage.set(`${client.appKey}${userCollectionName}`, data);
    } catch (error) {
      return false;
    }
  }

  return localStorage.remove(`${client.appKey}${userCollectionName}`);
}
