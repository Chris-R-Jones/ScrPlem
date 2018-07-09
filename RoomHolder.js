
// Static members
var g_rooms = null;
var g_mySpawnRooms = null;

class RoomHolder
{
    static clear(){
        g_rooms = {};
        if(!g_mySpawnRooms)
            g_mySpawnRooms = [];
        else
            g_mySpawnRooms.length = 0;
    }
    
    static getAllRooms(){
        return g_rooms;
    }
    
    static get( roomName ) {
        return g_rooms[roomName];
    }
    
    static set ( roomName, robj ) {
        g_rooms[roomName] = robj;
    }
    
    static addMySpawnRoom( rObj ){
        g_mySpawnRooms.push(rObj); 
    }
    
    static getMySpawnRooms(){
        return g_mySpawnRooms;
    }
    
}

module.exports = RoomHolder;
