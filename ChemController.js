var RoomHolder          = require('RoomHolder');
var LabGroup            = require('LabGroup');

class ChemController
{
    static run()
    {
        let sri;

        LabGroup.turnReset();

        let mySpawnRooms = RoomHolder.getMySpawnRooms();
        for(let sri=0; sri<mySpawnRooms.length; sri++){
            let roomObj = mySpawnRooms[sri];
            let labs  = roomObj.getLabs();
            if(!labs || ( labs.length !=3 && labs.length != 6 && labs.length != 10))
                continue;
            roomObj.setLabGroup(new LabGroup(roomObj, labs));
        }
    }
};

module.exports = ChemController;
