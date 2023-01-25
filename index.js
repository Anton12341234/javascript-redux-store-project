function createStore(reducer){
    let state       = reducer(undefined, {}) //стартовая инициализация состояния, запуск редьюсера со state === undefined
    let cbs         = []                     //массив подписчиков
    
    const getState  = () => state            //функция, возвращающая переменную из замыкания
    const subscribe = cb => (cbs.push(cb),   //запоминаем подписчиков в массиве
                             () => cbs = cbs.filter(c => c !== cb)) //возвращаем функцию unsubscribe, которая удаляет подписчика из списка
                             
    const dispatch  = action => { 
        if (typeof action === 'function'){ //если action - не объект, а функция
            return action(dispatch, getState) //запускаем эту функцию и даем ей dispatch и getState для работы
        }
        const newState = reducer(state, action) //пробуем запустить редьюсер
        if (newState !== state){ //проверяем, смог ли редьюсер обработать action
            state = newState //если смог, то обновляем state 
            for (let cb of cbs)  cb(state) //и запускаем подписчиков
        }
    }
    
    return {
        getState, //добавление функции getState в результирующий объект
        dispatch,
        subscribe //добавление subscribe в объект
    }
}

function combineReducers(reducers){
	function totalReducer(state={}, action){
		const newTotalState = {}
		for (const [reducerName, reducer] of Object.entries(reducers)){
			const newSubState = reducer(state[reducerName], action)
			if (newSubState !== state[reducerName]){
				newTotalState[reducerName] = newSubState
			}
		}
		if (Object.keys(newTotalState).length){
			return {...state, ...newTotalState}
		}

		return state
	}

	return totalReducer
}




function jwtDecode(token){
	try {
		return JSON.parse(atob(token.split('.')[1]))
	}
	catch(e){
	}
}

function localStoredReducer(reducer, localStorageKey){
	function wrapper(state, action){
		if (state === undefined){
			try {
				return JSON.parse(localStorage[localStorageKey]) 
			}
			catch(e){ } 
		}
		const newState = reducer(state, action)
		localStorage.setItem(localStorageKey, JSON.stringify(newState)) 
		return newState
	}
	return wrapper
}

const reducers = {
    auth: authReducer,
	cart: localStoredReducer(cartReducer, 'cart'), 
	promise: localStoredReducer(promiseReducer, 'promise'),
}


function promiseReducer(state={}, {type, status, payload, error,namePromise}){
    if (type === 'PROMISE'){
        return {
        ...state,
          [namePromise] : {status, payload, error}
        }
      }
      return state
}

const actionPending   = (namePromise)      => ({type: 'PROMISE', status: 'PENDING',namePromise})
const actionFulfilled = (namePromise,payload) => ({type: 'PROMISE', status: 'FULFILLED',namePromise, payload})
const actionRejected  = (namePromise,error)  => ({type: 'PROMISE', status: 'REJECTED', namePromise, error})


const actionPromise = (namePromise,promise) =>
    async dispatch => { 
        dispatch(actionPending(namePromise)) //сигнализируем redux, что промис начался
        try{
            const payload = await promise //ожидаем промиса
            dispatch(actionFulfilled(namePromise,payload)) //сигнализируем redux, что промис успешно выполнен
            return payload //в месте запуска store.dispatch с этим thunk можно так же получить результат промиса
        }
        catch (error){
            dispatch(actionRejected(namePromise,error)) //в случае ошибки - сигнализируем redux, что промис несложился
        }
    }




const store = createStore(combineReducers(reducers)) //не забудьте combineReducers если он у вас уже есть
store.subscribe(() => console.log(store.getState()))


function authReducer(state={}, {type, token}){
	if (type === 'AUTH_LOGIN'){ 
		const payload = jwtDecode(token)
		try{
            if (payload){
                return {
                    token,
                    payload
                }
		    }
        }
        catch (e) {}
	}
	if (type === 'AUTH_LOGOUT'){ 
		return {}
	}
	return state
}

const actionAuthLogout = () =>
	() => {
		store.dispatch({type: 'AUTH_LOGOUT'});
		localStorage.removeItem('authToken');
	}

const actionAuthLogin = (token) =>
	() => {
		const oldState = store.getState()
		store.dispatch({type: 'AUTH_LOGIN', token})
		const newState = store.getState()
		if (oldState !== newState)
			localStorage.setItem('authToken', token)
	}


function cartReducer(state={}, {type, count, good}){
    if(type==='CART_ADD'){
        if(typeof state[good._id]==='object'){
            let newCount = state[good._id].count+count
            return{
                ...state,
                [good._id]:{good:good, count:newCount}
            }
        }
        else{return{
            ...state,
            [good._id]:{good:good, count}
            }
        }
    }
    if(type==='CART_SET'){
        return{
            ...state,
            [good._id]:{good:good, count}
        }
    }
    if(type==='CART_SUB'){
        let newCount = state[good._id].count-count
        if(newCount>0){
            return{
                ...state,
                [good._id]:{good:good, count:newCount}
            }
        }else{
            delete state[good._id]
        }
    }
    if(type==='CART_DEL'){
        const {[good._id]: x,...newState} = state
		return newState
    }
    if(type==='CART_CLEAR'){
        return state={}
    }
    return state
}

const actionCartAdd = (good, count=1) => ({type: 'CART_ADD', count, good})
const actionCartSub = (good, count=1) => ({type: 'CART_SUB', count, good})
const actionCartDel = (good) => ({type: 'CART_DEL', good})
const actionCartSet = (good, count=1) => ({type: 'CART_SET', count, good})
const actionCartClear = () => ({type: 'CART_CLEAR'})


const checkToken = () => {
	const headers = {
		"Content-Type": "application/json",
		"Accept": "application/json",
	}
	if(localStorage.getItem('authToken')) {
		return {
			...headers,
			"Authorization": `Bearer ${localStorage.getItem('authToken')}`
		}
	} else {
		return headers;
	}
}

const getGQL = url =>
	(query, variables= {}) =>
		fetch(url, {
			method: 'POST',
			headers: checkToken(),
			body:JSON.stringify({query, variables})
		}).then(res => res.json())
			.then(data => {
				try {
					if(!data.data && data.errors) {
						throw new SyntaxError(`SyntaxError - ${JSON.stringify(Object.values(data.errors)[0])}`);
					}
					return Object.values(data.data)[0];
				} catch (e) {
					console.error(e);
				}
			});



const url = 'http://shop-roles.node.ed.asmer.org.ua/'
const gql = getGQL(url + 'graphql')


const rootCats = () => 
actionPromise('rootCats', gql(`query rootCats2{
CategoryFind(query: "[{\\"parent\\": null}]"){
        _id 
        name
        subCategories{_id name}
    }   
}`))
store.dispatch(rootCats()) 


const categoryGoods = (_id) => 
actionPromise('categoryGoods', gql(`query categoryGoods ($q:String) {
    CategoryFindOne(query: $q) {
        _id
        name
        parent {
          _id
          name
        }
        subCategories {
          _id
          name
        }
        goods {
          _id
          name
          price
          description
          images {
            url
          }
        }
      }
    }`, 
    {q: JSON.stringify([{_id}])}
))

const Img = (_id) => 
actionPromise('Img', gql(`query Img ($q:String) {
    GoodFindOne (query: $q){
        _id 
        name
        price
        description 
        images {
        url
        }
}}`,
{q: JSON.stringify([{_id}])}
))

const actionRegister = (login, password) => 
    actionPromise('reg', gql(`mutation reg($login: String, $password: String) {
      UserUpsert(user: {login: $login, password: $password}) {
        _id
        createdAt
      }
    }`, 
    {"login" : login,
    "password": password}
    ))

const actionLogin = (login, password) =>
actionPromise('login', gql(`query log($login:String, $password:String) {
                    login(login:$login, password:$password)
                }`, {login, password}));
  
const OrderHistory = () => 
actionPromise('OrderHistory', gql(`query historyOfOrders {
    OrderFind(query:"[{}]") {
    _id
    total
    createdAt
    total
    }}`,
    {query: JSON.stringify([{}])}
    ))

const orders = () =>
gql(`query myOrders {
                OrderFind(query:"[{}]"){
                _id total orderGoods{
                    price count total good{
                    _id name images{
                        url
                    }
                    }
                }
                }
            }`, {})

const actionOrders = () => actionPromise('myOrders', orders())

const actionOrder = () =>
async (dispatch, getState) => {
    const order = Object.values(getState().cart).map(orderGoods => ({good: {_id: orderGoods.good._id}, count: orderGoods.count}));
    const newOrder = await dispatch(actionPromise('newOrder', gql(`mutation newOrder($order:OrderInput) {
                                                        OrderUpsert(order:$order) {
                                                        _id createdAt total
                                                        }
                                                    }`, {order: {orderGoods: order}})));
    if(newOrder) {
        dispatch(actionCartClear());
        basket()
    }
}


store.subscribe(() => {
    const {status, payload, error} = store.getState().promise.rootCats
    if (status === 'PENDING'){
        main.innerHTML = `<img src='https://flevix.com/wp-content/uploads/2020/01/Bounce-Bar-Preloader-1.gif' style="width: 500px;"/>`
    }
    if (status === 'FULFILLED'){
        aside.innerHTML = ''
        for (const {_id, name} of payload){
            aside.innerHTML += `<a href= "#/category/${_id}">${name}</a>`
        }
    }
})


store.subscribe(() => {
    const token = store.getState().auth.token
    if (jwtDecode(token)){
        reg.innerHTML='<a href="#/orderhistory">Мои Заказы</a>'
        login.innerHTML=`<button onclick="store.dispatch(actionAuthLogout())">Выйти</button>`
    }else{
        reg.innerHTML='<a href="#/register">Регистрация</a>'
        login.innerHTML='<a href="#/login">Логин</a>'
    }
})
    
store.subscribe(() => {
    const {status, payload} = store.getState().promise?.myOrders || {}
    const [,route] = location.hash.split('/')
    if(route !== 'orderhistory') {
        return
    }
    if (status === 'PENDING'){
        main.innerHTML = `<img src='https://flevix.com/wp-content/uploads/2020/01/Bounce-Bar-Preloader-1.gif' style="width: 500px;"/>`
    }
    if (status === 'FULFILLED'){
        main.innerHTML = ''
        let i = 1
        for (const goods of payload){
            let divOrders = document.createElement('div')
            divOrders.style="border: 2px solid #ebebeb;margin: 30px;"
            let numberOrder = document.createElement('h1')
            numberOrder.innerText=`Заказ № ${i}\n`
            divOrders.append(numberOrder)
            for(const obj of goods.orderGoods){
                const { price, count, total,good}=obj
                const {_id,name,}=good

                let div = document.createElement('div')
                let button = document.createElement('button')
                let a = document.createElement('a')
                let p = document.createElement('p')
                div.style="border: 2px solid #ebebeb;margin: 30px;"
                a.href=`#/good/${_id}`
                a.innerText=`${name}`
                p.innerText=`Стоимость товара ${price} грн\nКолличество ${count} шт\nСтоимость заказа ${total} грн\n`
                div.append(a,p)
                button.onclick= ()=>store.dispatch(actionCartAdd({_id: _id, price:price, name:name}))
                button.innerText='Добавить в корзину'
                div.append(button)
                divOrders.append(div)
            }
            main.prepend(divOrders)
            i++
        }
        let h1 = document.createElement('h1')
        h1.innerText='История Заказов'
        main.prepend(h1)
    }
})

store.subscribe(() => {
    const {status, payload, error} = store.getState().promise?.categoryGoods || {}
    const [,route] = location.hash.split('/')
    if(route !== 'category') {
        return
    }
    
    if (status === 'PENDING'){
        main.innerHTML = `<img src='https://flevix.com/wp-content/uploads/2020/01/Bounce-Bar-Preloader-1.gif' style="width: 500px;"/>`
    }
    
    if (status === 'FULFILLED'){
        main.innerHTML = ''
        
        const {name, goods} = payload
        main.innerHTML = `<h1>${name}</h1>`
        for (const good of goods){
            const {_id, name, price, images}=good
            let div = document.createElement('div')
            let button = document.createElement('button')
            let a = document.createElement('a')
            let p = document.createElement('p')
            div.style="border: 2px solid #ebebeb;margin: 30px;"
            a.href=`#/good/${_id}`
            a.innerText=`${name}`
            p.innerText=`${price} грн`
            div.append(a,p)
            for (const img of images) {
                let img1 = document.createElement('img')
                img1.src= `${url+ img.url}`
                div.append(img1)
                }
                button.onclick= ()=>store.dispatch(actionCartAdd(good))
                button.innerText='Добавить в корзину'
            div.append(button)
            main.append(div)
        }
    }
})


store.subscribe(() => {
    const {status, payload, error} = store.getState().promise?.Img || { }
    const [,route] = location.hash.split('/')
    if(route !== 'good') {
        return
    }
    
    if (status === 'PENDING'){
        main.innerHTML = `<img src='https://flevix.com/wp-content/uploads/2020/01/Bounce-Bar-Preloader-1.gif' style="width: 500px;"/>`
    }
    
    if (status === 'FULFILLED'){
        main.innerHTML = ''
        
        const {name,price,_id, description, images} = payload
        
        main.innerHTML = `<h1>${name}</h1>
        
        <p>${description}</p>`
        for (const img of images) {
            main.innerHTML += `<img src= "${url+ img.url}">`
        }
        main.innerHTML += `<p>${price} грн</p><br>`
        let button = document.createElement('button')
        button.onclick=()=> store.dispatch(actionCartAdd({_id: _id, price:price, name:name}))
        button.innerText=`Добавить в корзину`
        main.append(button)
    }
})

store.subscribe(() => {
    const {cart} = store.getState()
    let summ = 0
    for(const {count} of Object.values(cart)) {
        summ +=count
    }
    cartIcon.innerHTML = `<a href="#/cart"><b>Товаров в корзине: ${summ}</b></a>`
})
      

basket=() => {
    main.innerHTML = '<h1>Корзина</h1><br>'
    const {cart} = store.getState()
    let totalPrice = 0
    for(let {count,good} of Object.values(cart)) {
        const {name,price,_id}=good
        totalPrice += price*count
        let div = document.createElement('div')
        let a = document.createElement('a')
        let p = document.createElement('p')
        let button = document.createElement('button')
        let buttonCartSet = document.createElement('button')
        let input = document.createElement('input')
        input.type="number"
        div.style="border: 2px solid #ebebeb;margin-top: 15px;margin-bottom: 15px;"
        a.href= `#/good/${_id}`
        a.innerText=name
        p.innerText=`Стоимость ${price} грн\n Колличество ${count}\n Общая стоимость ${price*count} грн\n`
        buttonCartSet.innerHTML=`Изменить количество товара<br>`
        buttonCartSet.onclick= ()=>{
            store.dispatch(actionCartSet({_id: _id, price:price, name:name},count=Number(input.value)));
            basket()
        }
        button.onclick= ()=>{
            store.dispatch(actionCartDel({_id: _id, price:price, name:name}));
            basket()
        }
        button.innerText= 'Удалить товар'
        main.append(div)
        div.append(a,p,input)
        div.append(buttonCartSet,button)
    }
    let checkoutDiv = document.createElement('div')
    let buttonOrder = document.createElement('button')
    checkoutDiv.innerText= `К оплате ${totalPrice} грн \n`
    buttonOrder.innerText= `Оформить заказ`
    buttonOrder.onclick= ()=>{
        store.dispatch(actionOrder());
        basket()
    }
    main.append(checkoutDiv)
    checkoutDiv.append(buttonOrder)
}



function Password(parent, open) {
    let inputPass = document.createElement('input')
    inputPass.value='Пароль'
    let inputLogin = document.createElement('input')
    inputLogin.value='Логин'
    let checkBox = document.createElement('input')
    let button = document.createElement('button')
    button.innerText='Войти'
    button.disabled=true
    checkBox.type = 'checkbox'
    let div = document.createElement('div')

    this.divInnerText =(text)=> div.innerText= text
    this.buttonInnerText =(text)=> button.innerText= text
    this.setValue =(value)=> inputPass.value = value
    this.setOpen =(open)=> inputPass.type= open ?'text':'password'

    this.getValuePass =()=> inputPass.value
    this.getValueLogin =()=> inputLogin.value
    this.getOpen =()=> inputPass.type
    

    checkBox.onchange =()=>this.setOpen(checkBox.checked)
    
    function btn (){
        if(inputPass.value && inputLogin.value){
            button.disabled=false
        }
        else{
            button.disabled=true
        }
    }

    inputPass.oninput = btn
    inputLogin.oninput = btn
    this.getbutton =(func)=> button.onclick=func
    parent.append(inputLogin,inputPass,checkBox,button,div)
}
store.dispatch(actionAuthLogin(localStorage.authToken))



window.onhashchange = () => {
    const [,route, _id] = location.hash.split('/')

    const routes = {
        category() {
            store.dispatch(categoryGoods(_id))
        },
        good(){
          store.dispatch(Img(_id))
        },
        cart(){
			basket();
		},
        orderhistory(){
			store.dispatch(actionOrders())
		},
        login(){
            main.innerHTML = '<h1>Вход</h1>'
            let windowLogin = new Password(main, false)
            windowLogin.buttonInnerText('Войти')
            windowLogin.getbutton(
            async () => {
                const token = await store.dispatch(actionLogin(windowLogin.getValueLogin(), windowLogin.getValuePass()))
                if (token){
                    store.dispatch(actionAuthLogin(token));
                    location.hash=''
                }
            })
        },
        register(){
            main.innerHTML = '<h1>Регистрация</h1>'
            let windowReg = new Password(main, false)
            windowReg.buttonInnerText('Зарегистрироваться')
            windowReg.getbutton(
                async () => {
                    const user = await store.dispatch(actionRegister(windowReg.getValueLogin(), windowReg.getValuePass()))
                    if(user) {
                        const token = await store.dispatch(actionLogin(windowReg.getValueLogin(), windowReg.getValuePass()))
                        if (token){
                            store.dispatch(actionAuthLogin(token));
                            location.hash=''
                        }
                    }
                })
        },
    }

    if (route in routes){
        routes[route]()
    }
}

window.onhashchange()

