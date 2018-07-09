class RoomCoord
{
    
    constructor(roomName)
    {
        let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(roomName);
        
        let wOrd = parsed[1];
        let wNum = Number(parsed[2]);
        let nOrd = parsed[3];
        let nNum = Number(parsed[4]);
        
        // We map 'W' onto range -N..0   (W1 = -1, W0 = 0)
        // We map 'E' onto range 1..N    (E0 = 1,  E1 = 2, ...)
        if(wOrd == 'W')
            this.x = (wNum == 0) ? 0 : -wNum;
        else
            this.x = wNum+1;
        
        // Similarly..
        // We map 'N' onto range -N..0   (N10 = -10, N0 = 0)
        // We map 'S' onto range 1..N    (S0 = 1, S1 = 2, ...)
        if(nOrd == 'N')
            this.y = (nNum == 0) ? 0 : -nNum;
        else
            this.y = nNum+1;
    }

    isEastOf( coord ) { return this.x > coord.x };
    isWestOf( coord ) { return this.x < coord.x };
    isNorthOf( coord ) { return this.y < coord.y };
    isSouthOf( coord ) { return this.y < coord.y };

    xDist( coord ) { return Math.abs(coord.x - this.x); }
    yDist( coord ) { return Math.abs(coord.y - this.y); }
    absDist( coord ) { return Math.max(this.xDist(), this.yDist()); }

    // Returns the neighbor room name, at relative position wDist, nDist
    // where wDist, nDist are integers indicating direction relative to the
    // room.
    //
    // For example.
    //     RoomCoord('W0N0').getNeighbor(0,-2) returns 'W0N2'
    //     RoomCoord('W0N0').getNeighbor(0,1)  returns 'W0S0'
    //     RoomCoord('W0N0').getNeighbor(1,2)  returns 'E0S1'
    getNeighbor(wDist, nDist){
        let nx = this.x + Number(wDist);
        let ny = this.y + Number(nDist);
        
        let res;

        if(nx <= 0)
            res = 'W'+(-nx);
        else
            res = 'E'+(nx-1);
        
        if(ny <= 0)
            res = res + 'N'+(-ny);
        else
            res = res + 'S'+(ny-1);
        return res;
    }

    // Return the result of converting this object's room coordinates back
    // to a name
    getName(){
        let res;
        if(this.x <= 0)
            res = 'W'+(-this.x);
        else
            res = 'E'+(this.x-1);
            
        if(this.y <= 0)
            res = res + 'N'+(-this.y);
        else
            res = res + 'S'+(this.y-1);
        return res;
    }

};


module.exports = RoomCoord;