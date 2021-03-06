namespace Utility {

    export function runGenerator(genFunc:(param?: any) => IterableIterator<any>, param?: any) {

        let iterator = genFunc();
        let result:IteratorResult<any>;

        function iterate(value?:any) {
            result = iterator.next(value);
            if (!result.done) {
                if (result.value instanceof Promise) {
                    result.value.then(iterate, reject);
                } else {
                    iterate(result.value);
                }
            }
        }

        function reject(reason){
            console.log(reason);
            throw new Error("promise is rejected");
        }

        iterate(param);
    }

    export let r = runGenerator;

    export function button(text:string, callback?: (evt: MouseEvent) => void): HTMLButtonElement {
        let button = document.createElement("button");
        button.innerText = text;
        if(callback)
            button.addEventListener("click", callback);
        return button;
    }

}

